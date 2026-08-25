"use strict";

const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config");

function normalizarDestino(to) {
  return String(to || "")
    .replace(/^whatsapp:/i, "")
    .replace(/^\+/, "");
}

function getMessagesUrl() {
  return `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
}

async function enviarPayload(payload) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("⚠️ WhatsApp no configurado. Payload omitido:", payload?.type || "unknown");
    return null;
  }

  const response = await axios.post(getMessagesUrl(), payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

async function sendText(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  return enviarPayload({
    messaging_product: "whatsapp",
    to: normalizarDestino(to),
    type: "text",
    text: { body: mensaje },
  });
}

async function sendImage(to, imageUrl, caption = "") {
  const link = String(imageUrl || "").trim();
  if (!link) return null;

  const image = { link };
  const texto = String(caption || "").trim();
  if (texto) image.caption = texto;

  return enviarPayload({
    messaging_product: "whatsapp",
    to: normalizarDestino(to),
    type: "image",
    image,
  });
}

async function sendDocument(to, documentUrl, filename, caption = "") {
  const link = String(documentUrl || "").trim();
  if (!link) return null;

  const document = { link };
  const nombre = String(filename || "").trim();
  const texto = String(caption || "").trim();
  if (nombre) document.filename = nombre;
  if (texto) document.caption = texto;

  return enviarPayload({
    messaging_product: "whatsapp",
    to: normalizarDestino(to),
    type: "document",
    document,
  });
}

module.exports = { sendText, sendImage, sendDocument };