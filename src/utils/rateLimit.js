const hits = new Map();

const NORMAL_MAX_MESSAGES = 20;
const FORM_MAX_MESSAGES = 45;
const WINDOW_MS = 60 * 1000;

const FORM_STEPS = new Set([
  "AGENDAR",
  "DIA_CITA",
  "DIA_PERSONALIZADO",
  "HORARIO_CITA",
  "HORARIO_PERSONALIZADO",
  "NOMBRE_CITA",
  "CEDULA_CITA",
  "TELEFONO_CITA",
  "CORREO_CITA",
  "CONFIRMAR_CITA",
  "ENVIANDO_CORREO_CITA",
]);

function isRateLimited(phone, step = "") {
  const now = Date.now();
  const data = hits.get(phone) || [];

  const recent = data.filter((time) => now - time < WINDOW_MS);
  recent.push(now);

  hits.set(phone, recent);

  const maxMessages = FORM_STEPS.has(step)
    ? FORM_MAX_MESSAGES
    : NORMAL_MAX_MESSAGES;

  return recent.length > maxMessages;
}

module.exports = { isRateLimited };
