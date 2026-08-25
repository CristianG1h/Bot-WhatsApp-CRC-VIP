"use strict";

const twilio = require("twilio");
const whatsappService = require("./whatsapp");

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

  // Este proyecto usa WhatsApp Cloud API como canal principal. Cuando Meta está
  // configurado, incluso los eventos que llegan desde Chatwoot se responden por
  // Cloud API para conservar botones, listas e imágenes interactivas.
  if (whatsappService.whatsappConfigurado()) {
    return whatsappService.sendText(to, mensaje);
  }

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

  if (whatsappService.whatsappConfigurado()) {
    if (!url) return whatsappService.sendText(to, mensaje);
    return whatsappService.sendImage(to, url, mensaje);
  }

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
