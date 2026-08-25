"use strict";

const {
  limpiarMensajeHabilitacionAntiguo,
} = require("../services/crcMedia");

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

function prepararMensajeSinConsultasExternas(_phone, body) {
  const original = String(body || "");
  let text = limpiarMensajeHabilitacionAntiguo(original);

  if (
    original.includes("Renovación o refrendación: $180.000") &&
    original.includes("¿Deseas agendar tu cita?")
  ) {
    text += "\n\n📷 *Adjunto enviado:* foto guía de la fachada de VIP CRC Galerías.";
  }

  if (original.includes("Cita preconfirmada - VIP CRC Galerías")) {
    text +=
      "\n\n📄 *Adjunto enviado:* certificado oficial de acreditación ONAC 22-CEP-076.";
  }

  return text.trim();
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