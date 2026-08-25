"use strict";

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const from = process.env.TWILIO_WHATSAPP_FROM;

function normalizarDestino(to) {
  return String(to || "").startsWith("whatsapp:")
    ? String(to)
    : `whatsapp:+${String(to || "").replace(/\D/g, "")}`;
}

function twilioConfigurado() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && from
  );
}

async function sendTwilioText(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  if (!twilioConfigurado()) {
    console.log("⚠️ Twilio no configurado. Mensaje:", mensaje);
    return null;
  }

  return client.messages.create({
    from,
    to: normalizarDestino(to),
    body: mensaje,
  });
}

async function sendTwilioMedia(to, body, mediaUrl) {
  const mensaje = String(body || "").trim();
  const url = String(mediaUrl || "").trim();
  if (!url) return sendTwilioText(to, mensaje);

  if (!twilioConfigurado()) {
    console.log("⚠️ Twilio no configurado. Adjunto omitido:", url);
    return null;
  }

  return client.messages.create({
    from,
    to: normalizarDestino(to),
    body: mensaje || undefined,
    mediaUrl: [url],
  });
}

module.exports = { sendTwilioText, sendTwilioMedia };