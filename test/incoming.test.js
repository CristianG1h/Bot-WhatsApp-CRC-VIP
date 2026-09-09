"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractIncoming } = require("../src/utils/incoming");
process.env.CHATWOOT_INBOX_ID = "2";
process.env.CHATWOOT_ACCOUNT_ID = "1";
const cw = () => ({ event: "message_created", message_type: 0, content: "Sí", id: 123,
  account: { id: 1 }, inbox: { id: 2 }, sender: { type: "contact", phone_number: "+570000000001" },
  conversation: { id: 99, meta: { sender: { phone_number: "+570000000001" } } } });
test("Chatwoot acepta incoming numérico y excluye notas, otra bandeja y otra cuenta", () => {
  assert.equal(extractIncoming("/chatwoot", cw()).length, 1);
  assert.equal(extractIncoming("/chatwoot", { ...cw(), private: true }).length, 0);
  assert.equal(extractIncoming("/chatwoot", { ...cw(), inbox: { id: 3 } }).length, 0);
  assert.equal(extractIncoming("/chatwoot", { ...cw(), account: { id: 3 } }).length, 0);
});
test("Se distingue asesor de bot sin tomar el teléfono del asesor", () => {
  const human = extractIncoming("/chatwoot", { ...cw(), message_type: 1, sender: { type: "user", phone_number: "+570000000999" } })[0];
  assert.equal(human.from, "whatsapp:+570000000001");
  assert.equal(human.human, true);
  assert.equal(extractIncoming("/chatwoot", { ...cw(), message_type: 1, sender: { type: "agent_bot" } }).length, 0);
});
test("Twilio usa ButtonPayload antes que el título del botón", () => {
  assert.equal(extractIncoming("/twilio", { From: "whatsapp:+570000000001", ButtonPayload: "1", Body: "Agendar", MessageSid: "SM1" })[0].text, "1");
  assert.equal(extractIncoming("/twilio", { From: "whatsapp:+570000000001", NumMedia: "1" })[0].media, true);
});
test("Meta procesa todos los mensajes del lote", () => {
  const result = extractIncoming("/", { entry: [{ changes: [{ value: { messages: [
    { from: "570000000001", id: "m1", type: "text", text: { body: "Hola" } },
    { from: "570000000002", id: "m2", type: "interactive", interactive: { button_reply: { id: "1", title: "Sí" } } },
  ] } }] }] });
  assert.equal(result.length, 2);
  assert.equal(result[1].text, "1");
});
