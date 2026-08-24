const sessions = new Map();
const { menuDiasDisponibles } = require("./agenda");

const PASOS_CRC_CON_CONSULTA_EXTERNA = new Set([
  "COMPARENDO",
  "COMPARENDO_SIMIT_DOCUMENTO",
  "CONSULTANDO_SIMIT_CRC",
  "SIMIT_DECISION_CRC",
  "CEDULA",
  "CONSULTANDO_RUNT",
  "RUNT_ACTIVA",
  "RUNT_SIN_LICENCIAS",
  "RUNT_REVISION_MANUAL",
  "CONFIRMAR_NOMBRE_RUNT",
]);

const PASOS_SIMIT_INDEPENDIENTE = new Set([
  "CIA_MENU",
  "CIA_AUTORIZACION",
  "CIA_DOCUMENTO",
  "CONSULTANDO_SIMIT",
  "CIA_FINAL",
]);

function normalizarClaveTelefono(phone) {
  const original = String(phone || "").trim();
  const digitos = original
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");

  return digitos || original.toLowerCase();
}

function crearSessionInicial(replyTo) {
  return {
    step: "MENU_INICIAL",
    linea: null,
    tramite: null,
    comparendos: null,
    asistencia: null,
    cedula: null,
    documentoSimit: null,
    simitTienePendientes: false,
    horarioCita: null,
    nombreRunt: null,
    nombreCita: null,
    cedulaCita: null,
    telefonoCita: null,
    correoCita: null,
    necesitaAsesor: false,
    asesorDisponible: false,
    asesorActivo: false,
    botPausadoPorAsesor: false,
    asesorLastAt: null,
    avisoReactivacionBotEnviado: false,
    consultaExternaDeshabilitada: null,
    replyTo: String(replyTo || "").trim() || null,
  };
}

function getSession(phone) {
  const key = normalizarClaveTelefono(phone);

  if (!sessions.has(key)) {
    sessions.set(key, crearSessionInicial(phone));
  }

  return sessions.get(key);
}

function setReplyTarget(phone, replyTo = phone) {
  const key = normalizarClaveTelefono(phone);
  const current = getSession(phone);

  sessions.set(key, {
    ...current,
    replyTo: String(replyTo || phone || "").trim() || current.replyTo || null,
  });
}

function convertirAFlujoSinConsultas(current, data = {}) {
  const stepSolicitado = data.step;

  if (!stepSolicitado) {
    return data;
  }

  const esSimitIndependiente =
    PASOS_SIMIT_INDEPENDIENTE.has(stepSolicitado) &&
    (data.linea === "CIA" || current.linea === "CIA" || stepSolicitado === "CIA_MENU");

  if (esSimitIndependiente) {
    return {
      ...data,
      step: "MENU_PRINCIPAL",
      linea: "CRC",
      comparendos: null,
      cedula: null,
      documentoSimit: null,
      simitTienePendientes: false,
      consultaExternaDeshabilitada: "SIMIT",
    };
  }

  if (PASOS_CRC_CON_CONSULTA_EXTERNA.has(stepSolicitado)) {
    return {
      ...data,
      step: "DIA_CITA",
      linea: "CRC",
      comparendos: "No consultado",
      cedula: null,
      documentoSimit: null,
      simitTienePendientes: false,
      nombreRunt: null,
      nombreCita: null,
      cedulaCita: null,
      telefonoCita: null,
      correoCita: null,
      diaCita: null,
      fechaCitaISO: null,
      horarioCita: null,
      consultaExternaDeshabilitada: "CRC",
    };
  }

  return {
    ...data,
    consultaExternaDeshabilitada: null,
  };
}

function updateSession(phone, data = {}) {
  const key = normalizarClaveTelefono(phone);
  const current = getSession(phone);
  const dataNormalizada = convertirAFlujoSinConsultas(current, data);

  const nuevaSession = {
    ...current,
    ...dataNormalizada,
  };

  if (!nuevaSession.replyTo) {
    nuevaSession.replyTo = current.replyTo || String(phone || "").trim() || null;
  }

  sessions.set(key, nuevaSession);
  console.log("✅ Sesión actualizada:", key, nuevaSession);
}

function prepararMensajeSinConsultasExternas(phone, body) {
  const texto = String(body || "");
  const session = getSession(phone);

  if (
    session.consultaExternaDeshabilitada === "CRC" &&
    session.step === "DIA_CITA"
  ) {
    return menuDiasDisponibles();
  }

  if (session.consultaExternaDeshabilitada === "SIMIT") {
    return `La consulta automática de SIMIT se encuentra desactivada para evitar que el bot se bloquee.

Si necesitas revisar comparendos o multas, puedes escribir *asesor* y te ayudaremos de forma manual.

Si deseas continuar con el proceso de licencia o agendar tu examen CRC, responde:

1️⃣ Iniciar proceso / agendar
2️⃣ Ver información
3️⃣ Hablar con asesor`;
  }

  return texto;
}

function resetSession(phone) {
  const key = normalizarClaveTelefono(phone);
  sessions.delete(key);
  console.log("🧹 Sesión reiniciada:", key);
}

function getAllSessions() {
  return Array.from(sessions.entries()).map(([key, session]) => [
    session.replyTo || key,
    session,
  ]);
}

module.exports = {
  getSession,
  updateSession,
  resetSession,
  getAllSessions,
  setReplyTarget,
  normalizarClaveTelefono,
  prepararMensajeSinConsultasExternas,
};
