"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAgendaReminders } = require("../src/services/agendaReminders");
function setup() {
  let session = { step: "AGENDAR_RENOVACION" };
  const callbacks = [], sent = [], queued = [];
  const service = createAgendaReminders({
    getSession: () => session,
    updateSession: (_from, data) => { session = { ...session, ...data }; },
    enqueue: (_from, task) => { const p = Promise.resolve().then(task); queued.push(p); return p; },
    sendDates: async (_from, text) => { sent.push(text); session.step = "DIA_CITA"; },
    setTimer: (callback, delay) => { callbacks.push({ callback, delay }); return callbacks.length; },
    clearTimer: () => {},
  });
  return { service, callbacks, sent, queued, setSession: (data) => { session = { ...session, ...data }; } };
}
test("Recordatorio de 3 minutos, una sola vez, pasa a elegir fecha", async () => {
  const { service, callbacks, sent, queued } = setup();
  service.schedule("whatsapp:+570000000000");
  assert.equal(callbacks[0].delay, 180000);
  callbacks[0].callback(); await Promise.all(queued);
  assert.equal(sent.length, 1);
  callbacks[0].callback(); await Promise.all(queued);
  service.schedule("570000000000");
  assert.equal(callbacks.length, 1);
  assert.equal(sent.length, 1);
});
test("Responder, elegir no, asesor o detener cancela el recordatorio", async () => {
  for (const state of [{ step: "DIA_CITA" }, { step: "NO_RENOVACION" }, { step: "HUMANO", botPausadoPorAsesor: true }, { noContactar: true }]) {
    const { service, callbacks, sent, queued, setSession } = setup();
    service.schedule("570000000001");
    setSession(state);
    callbacks[0].callback(); await Promise.all(queued);
    assert.equal(sent.length, 0);
  }
});
test("Una nueva respuesta invalida el temporizador anterior", async () => {
  const { service, callbacks, sent, queued } = setup();
  service.schedule("570000000001");
  service.cancel("whatsapp:+570000000001");
  service.schedule("570000000001");
  callbacks[0].callback(); await Promise.all(queued);
  assert.equal(sent.length, 0);
  callbacks[1].callback(); await Promise.all(queued);
  assert.equal(sent.length, 1);
});
test("No hay recordatorio sin interés en renovar ni fuera de la pregunta", () => {
  const { service, callbacks, setSession } = setup();
  for (const step of ["MENU_INICIAL", "RENOVACION_INTERES", "CONFIRMAR_CITA", "CITA_ENVIADA"]) {
    setSession({ step }); service.schedule("570000000001");
  }
  assert.equal(callbacks.length, 0);
});
