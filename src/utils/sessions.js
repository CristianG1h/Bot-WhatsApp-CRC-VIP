"use strict";


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
    updatedAt: Date.now(),
    linea: "CRC",
    tramite: null,
    diaCita: null,
    fechaCitaISO: null,
    fechaSugeridaISO: null,
    horarioCita: null,
    nombreCita: null,
    cedulaCita: null,
    telefonoCita: null,
    correoCita: null,
    necesitaAsesor: false,
    asesorActivo: false,
    botPausadoPorAsesor: false,
    asesorLastAt: null,
    avisoReactivacionBotEnviado: false,
    replyTo: String(replyTo || "").trim() || null,
  };
}

function getSession(phone) {
  const key = normalizarClaveTelefono(phone);

  const old = sessions.get(key);
  if (old && !old.botPausadoPorAsesor && Date.now() - old.updatedAt > 86400000) sessions.delete(key);
  if (!sessions.has(key)) {
    sessions.set(key, crearSessionInicial(phone));
  }

  return sessions.get(key);
}

function updateSession(phone, data = {}) {
  const key = normalizarClaveTelefono(phone);
  const current = getSession(phone);
  const nueva = {
    ...current,
    ...data,
    updatedAt: Date.now(),
    noEntendidos: data.step && data.step !== current.step ? 0 : (data.noEntendidos ?? current.noEntendidos ?? 0),
  };

  if (!nueva.replyTo) {
    nueva.replyTo = current.replyTo || String(phone || "").trim() || null;
  }

  sessions.set(key, nueva);
  return nueva;
}

function resetSession(phone) {
  const key = normalizarClaveTelefono(phone);
  sessions.delete(key);
}

function setReplyTarget(phone, replyTo = phone) {
  return updateSession(phone, {
    replyTo: String(replyTo || phone || "").trim() || null,
  });
}

function getAllSessions() {
  return Array.from(sessions.entries()).map(([key, session]) => [
    session.replyTo || key,
    session,
  ]);
}

function prepararMensajeSinConsultasExternas(_phone, body) {
  return String(body || "").trim();
}

module.exports = {
  getSession,
  updateSession,
  resetSession,
  setReplyTarget,
  getAllSessions,
  normalizarClaveTelefono,
  prepararMensajeSinConsultasExternas,
};
