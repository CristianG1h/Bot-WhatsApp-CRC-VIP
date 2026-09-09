"use strict";
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const twilioSdk = require("twilio");
delete process.env.DATABASE_URL;
process.env.DASHBOARD_USER = "test-user";
process.env.DASHBOARD_PASS = "test-password";
process.env.WEBHOOK_AUTH_MODE = "strict";
process.env.CHATWOOT_WEBHOOK_TOKEN = "test-webhook-token";
process.env.CHATWOOT_ACCOUNT_ID = "1";
process.env.CHATWOOT_INBOX_ID = "2";
process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
process.env.WHATSAPP_APP_SECRET = "test-meta-secret";
process.env.PUBLIC_URL = "https://crc.example.test";
const { app } = require("../src/server");
const Stats = require("../src/services/stats");
const server = app.listen(0, "127.0.0.1");
after(async () => { await new Promise((resolve) => server.close(resolve)); await Stats.close(); });
const request = async (path, options = {}) => {
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  return fetch("http://127.0.0.1:" + server.address().port + path, options);
};
const auth = { Authorization: "Basic " + Buffer.from("test-user:test-password").toString("base64") };
test("Salud, panel protegido, assets y estadísticas", async () => {
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/dashboard")).status, 401);
  assert.equal((await request("/api/stats")).status, 401);
  assert.equal((await request("/public/js/dashboard.js")).status, 401);
  assert.equal((await request("/dashboard", { headers: auth })).status, 200);
  const media = await request("/media/fachada.jpg");
  assert.equal(media.status, 200);
  assert.match(media.headers.get("content-type"), /image\/jpeg/);
  assert.equal((await request("/api/stats", { headers: auth })).status, 200);
});
test("Fechas inválidas y JSON incorrecto responden 400", async () => {
  assert.equal((await request("/api/stats?range=custom&from=2026-02-31&to=2026-09-08", { headers: auth })).status, 400);
  assert.equal((await request("/webhook/chatwoot", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
});
test("Chatwoot exige token; eventos vacíos no provocan envíos", async () => {
  const data = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  assert.equal((await request("/webhook/chatwoot", data)).status, 403);
  assert.equal((await request("/webhook/chatwoot?token=test-webhook-token", data)).status, 200);
});
test("Twilio exige firma correcta y devuelve TwiML", async () => {
  const body = new URLSearchParams({ MessageSid: "SM-test-empty" }).toString();
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  assert.equal((await request("/webhook/twilio", { method: "POST", headers, body })).status, 403);
  headers["x-twilio-signature"] = twilioSdk.getExpectedTwilioSignature("test-twilio-token",
    "https://crc.example.test/webhook/twilio", { MessageSid: "SM-test-empty" });
  const res = await request("/webhook/twilio", { method: "POST", headers, body });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<Response/>");
});
test("Meta valida firma sobre el cuerpo original y rechaza cambios", async () => {
  const body = '{"entry":[]}';
  const signature = crypto.createHmac("sha256", "test-meta-secret").update(body).digest("hex");
  const headers = { "Content-Type": "application/json", "x-hub-signature-256": "sha256=" + signature };
  assert.equal((await request("/webhook", { method: "POST", headers, body })).status, 200);
  assert.equal((await request("/webhook", { method: "POST", headers, body: '{"entry":[], "changed":true}' })).status, 403);
});
