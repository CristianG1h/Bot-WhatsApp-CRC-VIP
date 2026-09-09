"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localIntents, answerQuestion, classifyAI, sanitize } = require("../src/services/answers");
const { catalog } = require("../src/services/knowledge");

const cases = [
  ["Cuánto demora el examen?", ["duracion"]],
  ["Cuánto tiempo dura el proceso?", ["duracion"]],
  ["¿En cuánto termino?", ["duracion"]],
  ["Cuánto?", []],
  ["Cuanto vale renovar B1 y C1", ["precios"]],
  ["Dónde están ubicados", ["ubicacion"]],
  ["Cuál es la dirección y qué horarios tienen", ["horarios", "ubicacion"]],
  ["Puedo pagar con tarjeta?", ["pagos"]],
  ["Necesito mi certificado de la licencia", ["certificado_personal"]],
  ["Tienen acreditación ONAC", ["acreditacion"]],
  ["Tengo multas en SIMIT", ["simit"]],
  ["Comparendos", ["simit"]],
  ["Quiero el curso pedagógico", ["simit"]],
  ["Consultan el RUNT?", ["consulta_externa"]],
  ["Necesito exámenes ocupacionales", ["ocupacional"]],
  ["Exámenes de ingreso para mi empresa", ["ocupacional"]],
  ["Examen de egreso", ["ocupacional"]],
  ["Tienen telemedicina?", ["ocupacional"]],
  ["Ocupacionales y SIMIT", ["ocupacional", "simit"]],
  ["Examen médico para renovar", []],
  ["CRC VIP Salud Ocupacional, cuánto vale renovar mi licencia?", ["precios"]],
  ["Pregunta cuánto se demoran los exámenes?", ["duracion"]],
  ["Y cuanto demoran en entregar la licencia?", ["licencia_final"]],
  ["Puedo ir sin cita previa?", ["sin_cita"]],
  ["Cuánto cuesta el curso de conducción?", ["escuela"]],
  ["Cuanto vale primera vez", ["primera_vez"]],
  ["Vigencia del certificado", ["vigencia"]],
  ["Quiero cambiar mi cita", ["cita_existente"]],
];
for (const [text, expected] of cases) test("Intención: " + text, () => assert.deepEqual(localIntents(text), expected));

test("Tarifa aclara el alcance y datos comerciales son únicos", () => {
  assert.match(catalog().precios, /180\.000/);
  assert.match(catalog().precios, /examen CRC/);
  assert.match(catalog().ocupacional, /313 401 0901/);
  assert.match(catalog().ocupacional, /https:\/\/wa.me\/573134010901/);
  assert.doesNotMatch(catalog().simit, /escribe \*asesor\*/);
});
test("La IA no recibe cédula, correo ni enlaces", () => {
  const text = sanitize("CC 1234567890 paciente@example.test https://example.test/private");
  assert.doesNotMatch(text, /1234567890|paciente@|https:/);
});
test("No enviar respuestas ni datos propios del formulario a IA", async () => {
  const old = global.fetch;
  global.fetch = () => { throw new Error("No debe consultar IA"); };
  try {
    assert.equal(await answerQuestion("Ana Prueba", { step: "NOMBRE_CITA" }), null);
    assert.equal(await answerQuestion("1234567890", { step: "CEDULA_CITA" }), null);
    assert.equal(await answerQuestion("ana@example.test", { step: "CORREO_CITA" }), null);
    assert.equal(await answerQuestion("2026-09-15", { step: "DIA_CITA" }), null);
    assert.equal(await answerQuestion("2:00 pm", { step: "HORARIO_CITA" }), null);
  } finally { global.fetch = old; }
});
test("IA: rechaza JSON inválido, intención ajena y baja confianza", async () => {
  const old = global.fetch;
  const key = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-only";
  try {
    for (const content of ["oops", '{"intent":"precios","confidence":0.1}', '{"intent":"inventar","confidence":1}', '{"intent":"precios","confidence":"alta"}']) {
      global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
      assert.deepEqual(await classifyAI("Pregunta desconocida", {}), []);
    }
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"intent":"duracion","confidence":0.95,"respuesta":"Cualquier texto inventado"}' } }] }) });
    const result = await answerQuestion("¿La evaluación me toma mucho rato?", { step: "MENU_INFORMACION" });
    assert.equal(result.text, catalog().duracion);
    global.fetch = async () => { throw new Error("timeout"); };
    assert.deepEqual(await classifyAI("Pregunta", {}), []);
  } finally {
    global.fetch = old;
    if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key;
  }
});
