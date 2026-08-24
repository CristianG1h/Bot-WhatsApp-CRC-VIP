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
  };

  if (!nueva.replyTo) {
    nueva.replyTo = current.replyTo || String(phone || "").trim() || null;
  }

  sessions.set(key, nueva);
  console.log("✅ Sesión actualizada:", key, nueva.step);
  return nueva;
}

function resetSession(phone) {
  const key = normalizarClaveTelefono(phone);
  sessions.delete(key);
  console.log("🧹 Sesión reiniciada:", key);
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

module.exports = {
  getSession,
  updateSession,
  resetSession,
  setReplyTarget,
  getAllSessions,
  normalizarClaveTelefono,
};
