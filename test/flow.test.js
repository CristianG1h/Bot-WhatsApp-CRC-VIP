"use strict";
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
delete process.env.DATABASE_URL;
delete process.env.GROQ_API_KEY;
const twilio = require("../src/services/twilio");
const meta = require("../src/services/whatsapp");
const chatwoot = require("../src/services/chatwoot");
const mail = require("../src/services/email");
let messages = [], emails = [], transfers = [], failEmail = false, failSend = false;
twilio.sendTwilioText = meta.sendText = async (to, text) => {
  if (failSend) throw new Error("transport down");
  messages.push({ to, text });
  return { sid: "test-message" };
};
chatwoot.logIncomingMessage = chatwoot.logOutgoingMessage = async () => {};
chatwoot.rememberConversation = async () => {};
chatwoot.markNeedsAgent = async (to, reason) => { transfers.push({ to, reason }); return { id: 1 }; };
mail.enviarCorreoCita = async (data) => { if (failEmail) throw new Error("mail down"); emails.push(data); return true; };
const route = require("../src/routes/whatsapp");
const sessions = require("../src/utils/sessions");
const Stats = require("../src/services/stats");
let id = 0, user = 570000000000;
const newUser = () => "whatsapp:+" + (++user);
const send = (from, text, extra = {}) => route.handleIncoming({ from, text, source: "twilio", messageId: "test-" + (++id), ...extra });
beforeEach(() => { route.close(); messages = []; emails = []; transfers = []; failEmail = false; failSend = false; Stats.resetStats(); });
async function draft(from) {
  for (const text of ["Hola", "Sí", "Sí", "3", "15/09/2027", "1", "Ana Prueba", "1234567890", "este número", "ana@example.test"]) await send(from, text);
  assert.equal(sessions.getSession(from).step, "CONFIRMAR_CITA");
}

test("Sí a renovación conserva la pregunta de agendamiento", async () => {
  const from = newUser();
  await send(from, "Hola");
  await send(from, "Sí");
  assert.equal(sessions.getSession(from).step, "AGENDAR_RENOVACION");
  assert.match(messages.at(-1).text, /¿Deseas agendar tu cita/);
  await send(from, "Sí");
  assert.equal(sessions.getSession(from).step, "DIA_CITA");
  assert.match(messages.at(-1).text, /próximos días disponibles/);
  assert.match(messages.at(-1).text, /Horario:/);
  assert.doesNotMatch(messages.at(-1).text, /¿Deseas agendar/);
});
test("Ocupacionales y SIMIT también funcionan en el primer mensaje", async () => {
  for (const [query, expected] of [["exámenes ocupacionales", /wa.me\/573134010901/], ["SIMIT", /No contamos con información/]]) {
    await send(newUser(), query);
    assert.match(messages.at(-1).text, expected);
    assert.doesNotMatch(messages.at(-1).text, /¿Estás interesado/);
  }
});
test("Preguntas intercaladas conservan el paso; duración no responde precio", async () => {
  const from = newUser();
  await send(from, "Hola"); await send(from, "Sí"); await send(from, "Sí");
  await send(from, "Cuánto demora?");
  assert.equal(sessions.getSession(from).step, "DIA_CITA");
  assert.match(messages.at(-1).text, /40 a 60/);
  assert.doesNotMatch(messages.at(-1).text, /180.000/);
  await send(from, "exámenes de ingreso");
  assert.equal(sessions.getSession(from).step, "DIA_CITA");
});
test("Asesor es un comando global y no se reactiva solo", async () => {
  for (const step of ["MENU_INICIAL", "RENOVACION_INTERES", "NOMBRE_CITA", "DIA_CITA", "CONFIRMAR_CITA"]) {
    const from = newUser();
    sessions.updateSession(from, { step });
    await send(from, "Quiero hablar con un asesor");
    assert.equal(sessions.getSession(from).step, "HUMANO");
    const count = messages.length;
    sessions.updateSession(from, { asesorLastAt: Date.now() - 3600000 });
    await send(from, "Cuánto demora?");
    assert.equal(messages.length, count);
    await send(from, "menú");
    assert.equal(sessions.getSession(from).step, "RENOVACION_INTERES");
  }
});
test("Agendamiento, corrección de un campo y doble confirmación", async () => {
  const from = newUser(); await draft(from);
  await send(from, "2"); await send(from, "4");
  await send(from, "nueva@example.test");
  assert.equal(sessions.getSession(from).nombreCita, "Ana Prueba");
  assert.equal(sessions.getSession(from).step, "CONFIRMAR_CITA");
  await Promise.all([send(from, "1"), send(from, "1")]);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].correo, "nueva@example.test");
  assert.ok(emails[0].solicitudId);
  assert.equal(sessions.getSession(from).step, "CITA_ENVIADA");
  assert.ok(messages.some((m) => m.text.includes("deben ser confirmadas por el centro")));
});
test("Falla de correo conserva caso para asesor, sin falsa confirmación", async () => {
  const from = newUser(); await draft(from);
  failEmail = true; await send(from, "1");
  assert.equal(emails.length, 0);
  assert.equal(sessions.getSession(from).step, "HUMANO");
  assert.match(transfers.at(-1).reason, /envío de correo no confirmado/);
  assert.ok(messages.some((m) => /No pude confirmar el envío/.test(m.text)));
});
test("Duplicado entre Twilio y Chatwoot se procesa una sola vez", async () => {
  const from = newUser();
  await send(from, "Hola", { messageId: "shared", source: "twilio" });
  await send(from, "Hola", { messageId: "chatwoot-1", externalId: "shared", source: "chatwoot" });
  assert.equal(messages.length, 1);
  const result = await Stats.getSnapshot();
  assert.equal(result.totales.mensajesRecibidos, 1);
  assert.equal(result.totales.duplicadosIgnorados, 1);
});
test("Fecha numerada no cambia de significado al pasar medianoche", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-08T12:00:00Z") });
  const from = newUser(); await send(from, "Hola"); await send(from, "Sí"); await send(from, "Sí");
  assert.equal(sessions.getSession(from).diasOfrecidos[0], "2026-09-08");
  t.mock.timers.setTime(new Date("2026-09-09T05:01:00Z").getTime());
  await send(from, "1");
  assert.equal(sessions.getSession(from).step, "DIA_CITA");
  assert.ok(messages.some((m) => /ya no está disponible/.test(m.text)));
});
test("Audio y tres errores reciben salida útil", async () => {
  const from = newUser();
  await send(from, "", { media: true });
  assert.match(messages.at(-1).text, /no puedo interpretarlo/);
  await send(from, "Hola");
  for (let i = 0; i < 3; i++) await send(from, "no entiendo");
  assert.equal(sessions.getSession(from).step, "HUMANO");
});
test("Fallo de transporte no cuenta mensaje como enviado", async () => {
  failSend = true; const from = newUser(); await send(from, "Hola");
  const stats = await Stats.getSnapshot();
  assert.equal(stats.totales.mensajesEnviados, 0);
  assert.equal(stats.totales.erroresBot, 1);
  assert.equal(sessions.getSession(from).step, "HUMANO");
});
test("Flujo completo: silencio de tres minutos envía fechas una vez", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-09-08T12:00:00Z") });
  const { drain } = require("../src/utils/messageQueue");
  const from = newUser();
  await send(from, "Hola"); await send(from, "si me interesa");
  assert.equal(sessions.getSession(from).step, "AGENDAR_RENOVACION");
  const before = messages.length;
  t.mock.timers.tick(179999); await drain();
  assert.equal(messages.length, before);
  t.mock.timers.tick(1); await drain();
  assert.equal(messages.length, before + 1);
  assert.equal(sessions.getSession(from).step, "DIA_CITA");
  assert.match(messages.at(-1).text, /Si te queda más fácil/);
  t.mock.timers.tick(180000); await drain();
  assert.equal(messages.length, before + 1);
});
test("Flujo completo: no quiero agendar impide enviar recordatorio", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-09-08T12:00:00Z") });
  const { drain } = require("../src/utils/messageQueue");
  const from = newUser();
  await send(from, "Hola"); await send(from, "Sí"); await send(from, "no quiero agendar");
  assert.equal(sessions.getSession(from).step, "NO_RENOVACION");
  const before = messages.length;
  t.mock.timers.tick(180000); await drain();
  assert.equal(messages.length, before);
});
test("Una consulta de SIMIT u ocupacionales cancela el seguimiento comercial", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-09-08T12:00:00Z") });
  const { drain } = require("../src/utils/messageQueue");
  for (const text of ["SIMIT", "Exámenes ocupacionales"]) {
    const from = newUser();
    await send(from, "Hola"); await send(from, "Sí"); await send(from, text);
    const before = messages.length;
    t.mock.timers.tick(180000); await drain();
    assert.equal(messages.length, before);
  }
});
test("Primera vez por texto conserva su trámite y no usa tarifa de renovación", async () => {
  const from = newUser();
  await send(from, "Hola"); await send(from, "Quiero sacar la licencia por primera vez");
  assert.equal(sessions.getSession(from).step, "AGENDAR_PRIMERA_VEZ");
  assert.match(messages.at(-1).text, /confirmar la tarifa/);
  assert.doesNotMatch(messages.at(-1).text, /180.000/);
  await send(from, "Sí");
  assert.equal(sessions.getSession(from).step, "DIA_CITA");
  assert.equal(sessions.getSession(from).tramite, "Primera vez");
});
