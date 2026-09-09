"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/utils/agenda");
const date = (iso) => new Date(iso + "T12:00:00Z");
test("Fechas inválidas, ISO y año bisiesto", () => {
  assert.equal(A.parsearFechaUsuario("31/02/2027"), null);
  assert.equal(A.parsearFechaUsuario("2027-02-29"), null);
  assert.equal(A.fechaKey(A.parsearFechaUsuario("2028-02-29")), "2028-02-29");
  assert.equal(A.fechaKey(A.parsearFechaUsuario("2027-09-15")), "2027-09-15");
});
test("Domingos y festivos; sábado cierra a 11:30", () => {
  assert.equal(A.motivoNoLaboral(date("2026-09-13")), "domingo");
  assert.equal(A.motivoNoLaboral(date("2026-10-12")), "festivo");
  assert.equal(A.obtenerSlotsDisponibles(date("2027-09-11")).at(-1).fin, 690);
  assert.equal(A.obtenerSlotsDisponibles(date("2027-09-13")).at(-1).fin, 930);
  assert.equal(A.festivosColombia(2026).size, 18);
});
test("Hora fuera de jornada, hora imposible, sábado tarde y fechas pasadas", () => {
  assert.equal(A.validarHorarioPersonalizado("8:00 pm", date("2027-09-13")), null);
  assert.equal(A.validarHorarioPersonalizado("10:99 am", date("2027-09-13")), null);
  assert.equal(A.validarHorarioPersonalizado("2 pm", date("2027-09-11")), null);
  assert.equal(A.validarHorarioPersonalizado("10 am", date("2025-09-11")), null);
  assert.equal(A.validarHorarioPersonalizado("10:00 am", date("2027-09-13")).inicio, 600);
  assert.equal(A.validarHorarioPersonalizado("2 pm", date("2027-09-13")).inicio, 840);
});
test("Una hora concreta caduca antes de la confirmación", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-08T15:00:00Z") });
  const fecha = date("2026-09-08");
  const selected = A.validarHorarioPersonalizado("10:30 am", fecha);
  assert.ok(selected);
  t.mock.timers.setTime(new Date("2026-09-08T15:20:00Z").getTime());
  assert.equal(A.horarioSigueDisponible(fecha, selected), false);
});
