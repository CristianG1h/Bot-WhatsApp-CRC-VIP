"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
delete process.env.DATABASE_URL;
const Stats = require("../src/services/stats");
test("Métricas separan envío, cita y asesor; filtros funcionan en memoria", async () => {
  await Stats.ready; Stats.resetStats();
  Stats.mensajeRecibido("570000000001");
  Stats.mensajeEnviado("570000000001", "respuesta");
  Stats.citaPreconfirmada("570000000001");
  Stats.asesorActivado("570000000002");
  const all = await Stats.getSnapshot();
  assert.equal(all.totales.mensajesEnviados, 1);
  assert.equal(all.totales.citasPreconfirmadas, 1);
  const search = await Stats.getSnapshot({ q: "570000000002" });
  assert.equal(search.totales.mensajesRecibidos, 0);
  assert.equal(search.totales.asesoresActivados, 1);
  const past = await Stats.getSnapshot({ range: "custom", from: "2020-01-01", to: "2020-01-02" });
  assert.equal(past.totales.mensajesEnviados, 0);
  assert.doesNotMatch(JSON.stringify(all.ultimasInteracciones), /"wa_id"/);
});
test("Rangos gigantes, invertidos e inválidos no llegan a consulta", async () => {
  for (const q of [
    { range: "custom", from: "2026-09-10", to: "2026-09-08" },
    { chartRange: "custom", chartFrom: "0001-01-01", chartTo: "9999-12-31" },
    { chartOffset: "Infinity" },
  ]) await assert.rejects(Stats.getSnapshot(q), (e) => e.status === 400);
});
