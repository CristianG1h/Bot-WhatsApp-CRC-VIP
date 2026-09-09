"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../src/public/dashboard.html"), "utf8");
const code = fs.readFileSync(path.join(__dirname, "../src/public/js/dashboard.js"), "utf8");
function page() {
  const elements = new Map();
  for (const match of html.matchAll(/id="([^"]+)"/g)) {
    assert.ok(!elements.has(match[1]), "ID HTML repetido: " + match[1]);
    elements.set(match[1], { value: "", textContent: "", innerHTML: "", addEventListener() {}, removeAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } });
  }
  elements.get("rangeSelect").value = "all";
  elements.get("chartRangeSelect").value = "14d";
  const context = vm.createContext({ URLSearchParams, AbortController, console: { error() {} },
    document: { getElementById: (id) => elements.get(id), querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} }, setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ totales: { mensajesNoReconocidos: 7 },
      ultimasInteracciones: [], keywords: {}, uptime: 1, iniciadoEn: "2026-09-08T12:00:00Z" }) }),
  });
  vm.runInContext(code, context);
  return { context, elements };
}
test("El panel carga métricas y fechas sin Chart.js ni flatpickr", async () => {
  const { context, elements } = page();
  await context.loadStats();
  assert.equal(elements.get("m-norec").textContent, "7");
  assert.equal(elements.get("fromInput").type, "date");
  assert.equal(elements.get("liveLabel").textContent, "Actualizado");
});
test("El historial y las palabras no insertan HTML de una conversación", () => {
  const { context, elements } = page();
  const payload = '<img src=x onerror="alert(1)">';
  context.renderLogs([{ detalle: payload, hora: payload, fecha: "2026-09-08", estado: "ok" }]);
  context.renderKeywords({ [payload]: 2 });
  for (const id of ["logBody", "kwBars"]) {
    assert.doesNotMatch(elements.get(id).innerHTML, /<img/);
    assert.match(elements.get(id).innerHTML, /&lt;img/);
  }
});
test("Un fallo HTTP muestra estado sin actualizar", async () => {
  const { context, elements } = page();
  context.fetch = async () => ({ ok: false, status: 503 });
  await context.loadStats();
  assert.equal(elements.get("liveLabel").textContent, "Sin actualizar");
  assert.match(elements.get("statsStatus").textContent, /No se pudieron cargar/);
});
