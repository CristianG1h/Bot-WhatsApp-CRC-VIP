"use strict";
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
process.env.TWILIO_ACCOUNT_SID = "AC" + "0".repeat(32);
process.env.TWILIO_AUTH_TOKEN = "test-only";
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+570000000000";
process.env.WHATSAPP_TOKEN = "test-only";
process.env.PHONE_NUMBER_ID = "test-only";
process.env.GOOGLE_SCRIPT_EMAIL_URL = "https://mail.example.test";
process.env.GOOGLE_SCRIPT_EMAIL_KEY = "test-only";
const creates = [];
let failInteractive = false;
// Replace only the provider SDK boundary, never the transport under test.
require("twilio");
require.cache[require.resolve("twilio")].exports = () => ({ messages: { create: async (data) => {
  if (failInteractive && data.contentSid) throw new Error("interactive unavailable");
  creates.push(data); return { sid: "test-sid" };
} } });
const twilio = require("../src/services/twilio");
const axios = require("axios");
axios.post = async (_url, data) => { creates.push(data); return { data: { messages: [{ id: "test-meta" }] } }; };
const meta = require("../src/services/whatsapp");
const email = require("../src/services/email");
beforeEach(() => {
  creates.length = 0; failInteractive = false;
  global.fetch = async (_url, options) => ({ ok: true, text: async () => JSON.stringify(options.method === "GET"
    ? { contents: [] } : { sid: "HX" + "0".repeat(32) }) });
});
test("Twilio conserva la pregunta de agendar en un botón y tiene respaldo completo", async () => {
  const body = require("../src/services/knowledge").catalog().precios + "\n\n¿Deseas agendar tu cita?\n\n1️⃣ Sí\n2️⃣ No";
  await twilio.sendTwilioText("whatsapp:+570000000001", body);
  assert.match(JSON.parse(creates[0].contentVariables)["1"], /¿Deseas agendar tu cita/);
  failInteractive = true;
  await twilio.sendTwilioText("whatsapp:+570000000001", body);
  assert.equal(creates.at(-1).body, body);
});
test("Textos largos conservan contenido y emojis en Twilio y Meta", async () => {
  const body = "🚗".repeat(1700);
  await twilio.sendTwilioText("whatsapp:+570000000001", body);
  assert.equal(creates.map((m) => m.body).join(""), body);
  assert.ok(creates.every((m) => m.body.length <= 1500 && !/[\uD800-\uDBFF]$/.test(m.body)));
  creates.length = 0;
  await meta.sendText("570000000001", body);
  assert.equal(creates.map((m) => m.text.body).join(""), body);
});
test("Meta conserva los identificadores de las opciones", async () => {
  await meta.sendReplyButtons("570000000001", "¿Deseas agendar?", [{ id: "1", title: "Sí" }, { id: "2", title: "No" }]);
  assert.deepEqual(creates[0].interactive.action.buttons.map((b) => b.reply.id), ["1", "2"]);
});
test("Correo solo acepta confirmación explícita; errores no dan éxito", async () => {
  for (const data of [{}, { ok: false }, { ok: "true" }]) {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => data });
    await assert.rejects(email.enviarCorreoCita({ solicitudId: "test-only" }));
  }
  global.fetch = async () => { throw new Error("timeout"); };
  await assert.rejects(email.enviarCorreoCita({ solicitudId: "test-only" }));
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  assert.equal(await email.enviarCorreoCita({ solicitudId: "test-only" }), true);
});
