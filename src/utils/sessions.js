const sessions = new Map();

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

function updateSession(phone, data = {}) {
  const key = normalizarClaveTelefono(phone);
  const current = getSession(phone);

  const nuevaSession = {
    ...current,
    ...data,
  };

  if (!nuevaSession.replyTo) {
    nuevaSession.replyTo = current.replyTo || String(phone || "").trim() || null;
  }

  sessions.set(key, nuevaSession);
  console.log("✅ Sesión actualizada:", key, nuevaSession);
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
};
