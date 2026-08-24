"use strict";

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const from = process.env.TWILIO_WHATSAPP_FROM;

async function sendTwilioText(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
    console.log("⚠️ Twilio no configurado. Mensaje:", mensaje);
    return null;
  }

  return client.messages.create({
    from,
    to: String(to || "").startsWith("whatsapp:")
      ? String(to)
      : `whatsapp:+${String(to || "").replace(/\D/g, "")}`,
    body: mensaje,
  });
}

module.exports = { sendTwilioText };
