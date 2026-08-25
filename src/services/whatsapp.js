"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config");

function normalizarDestino(to) {
  return String(to || "")
    .replace(/^whatsapp:/i, "")
    .replace(/^\+/, "");
}

function whatsappConfigurado() {
  return Boolean(
    String(WHATSAPP_TOKEN || "").trim() && String(PHONE_NUMBER_ID || "").trim()
  );
}

function getMessagesUrl() {
  return `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
}

function getMediaUrl() {
  return `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`;
}

async function enviarPayload(payload) {
  if (!whatsappConfigurado()) {
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

async function uploadMediaFile(filePath, mimeType = "application/octet-stream") {
  if (!whatsappConfigurado()) {
    throw new Error("WhatsApp Cloud API no está configurado");
  }

  const absolutePath = path.resolve(filePath);
  const bytes = await fs.promises.readFile(absolutePath);
  const filename = path.basename(absolutePath);

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([bytes], { type: mimeType }), filename);

  const response = await fetch(getMediaUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: form,
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || !data?.id) {
    throw new Error(
      `Meta media upload ${response.status}: ${JSON.stringify(data)}`
    );
  }

  console.log("⬆️ Imagen cargada a Meta. media_id:", data.id);
  return data.id;
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

async function sendImageFile(to, filePath, caption = "", mimeType = "image/jpeg") {
  const mediaId = await uploadMediaFile(filePath, mimeType);
  const image = { id: mediaId };
  const texto = String(caption || "").trim();
  if (texto) image.caption = texto;

  const result = await enviarPayload({
    messaging_product: "whatsapp",
    to: normalizarDestino(to),
    type: "image",
    image,
  });

  const messageId = result?.messages?.[0]?.id || null;
  console.log(
    "🖼️ Imagen enviada directamente por Meta:",
    normalizarDestino(to),
    messageId ? `message_id=${messageId}` : "sin message_id"
  );

  return result;
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

module.exports = {
  whatsappConfigurado,
  sendText,
  sendImage,
  sendImageFile,
  sendDocument,
  uploadMediaFile,
};
