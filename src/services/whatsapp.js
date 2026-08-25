"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config");

const FACHADA_LOCAL_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "fachada-crc-vip.jpg"
);
const FACHADA_REPO_URL =
  "https://raw.githubusercontent.com/CristianG1h/Bot-WhatsApp-CRC-VIP/main/src/assets/fachada-crc-vip.jpg";

let fachadaMediaId = null;

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
    console.log(
      "⚠️ WhatsApp no configurado. Payload omitido:",
      payload?.type || "unknown"
    );
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

  console.log("⬆️ Medio cargado a Meta. media_id:", data.id);
  return data.id;
}

async function obtenerFachadaMediaId() {
  if (fachadaMediaId) return fachadaMediaId;

  try {
    fachadaMediaId = await uploadMediaFile(FACHADA_LOCAL_PATH, "image/jpeg");
    console.log("🏢 Fachada cargada desde el archivo del repositorio");
    return fachadaMediaId;
  } catch (error) {
    console.error(
      "⚠️ No se pudo cargar la fachada local a Meta; se usará URL RAW:",
      error.message
    );
    return null;
  }
}

function recortarTitulo(valor, max = 20) {
  const texto = String(valor || "").trim();
  return texto.length <= max ? texto : texto.slice(0, max);
}

async function sendReplyButtons(to, body, buttons, options = {}) {
  const texto = String(body || "").trim();
  const validos = (Array.isArray(buttons) ? buttons : [])
    .slice(0, 3)
    .map((button) => ({
      type: "reply",
      reply: {
        id: String(button.id || "").slice(0, 256),
        title: recortarTitulo(button.title),
      },
    }))
    .filter((button) => button.reply.id && button.reply.title);

  if (!texto || !validos.length) return null;

  const interactive = {
    type: "button",
    body: { text: texto.slice(0, 1024) },
    action: { buttons: validos },
  };

  const footer = String(options.footer || "").trim();
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  if (options.headerImage === "fachada") {
    const mediaId = await obtenerFachadaMediaId();
    interactive.header = mediaId
      ? { type: "image", image: { id: mediaId } }
      : { type: "image", image: { link: FACHADA_REPO_URL } };
  }

  try {
    const result = await enviarPayload({
      messaging_product: "whatsapp",
      to: normalizarDestino(to),
      type: "interactive",
      interactive,
    });

    console.log(
      "🔘 Mensaje interactivo enviado por Meta:",
      normalizarDestino(to),
      options.headerImage === "fachada" ? "con fachada" : "sin imagen"
    );
    return result;
  } catch (error) {
    if (options.headerImage === "fachada" && interactive.header?.image?.id) {
      fachadaMediaId = null;
      console.error(
        "⚠️ Falló botón con media_id; se reintentará con URL del repositorio:",
        error.response?.data || error.message
      );

      interactive.header = {
        type: "image",
        image: { link: FACHADA_REPO_URL },
      };

      return enviarPayload({
        messaging_product: "whatsapp",
        to: normalizarDestino(to),
        type: "interactive",
        interactive,
      });
    }

    throw error;
  }
}

async function sendList(to, body, buttonText, rows, options = {}) {
  const texto = String(body || "").trim();
  const filas = (Array.isArray(rows) ? rows : [])
    .slice(0, 10)
    .map((row) => ({
      id: String(row.id || "").slice(0, 200),
      title: String(row.title || "").trim().slice(0, 24),
      ...(row.description
        ? { description: String(row.description).trim().slice(0, 72) }
        : {}),
    }))
    .filter((row) => row.id && row.title);

  if (!texto || !filas.length) return null;

  const interactive = {
    type: "list",
    body: { text: texto.slice(0, 1024) },
    action: {
      button: String(buttonText || "Ver opciones").slice(0, 20),
      sections: [
        {
          title: String(options.sectionTitle || "Opciones").slice(0, 24),
          rows: filas,
        },
      ],
    },
  };

  const footer = String(options.footer || "").trim();
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  return enviarPayload({
    messaging_product: "whatsapp",
    to: normalizarDestino(to),
    type: "interactive",
    interactive,
  });
}

function quitarBloque(texto, patron) {
  return String(texto || "").replace(patron, "").trim();
}

async function intentarMensajeInteractivo(to, mensaje) {
  if (
    mensaje.includes("¿Estás interesado(a) en *renovar tu licencia de conducción*?")
  ) {
    const body = quitarBloque(
      mensaje,
      /\n\n1️⃣ Sí\n2️⃣ No\n\nResponde con el número de la opción\.?$/
    );
    return sendReplyButtons(
      to,
      body,
      [
        { id: "1", title: "Sí" },
        { id: "2", title: "No" },
      ],
      { footer: "Toca una opción para responder" }
    );
  }

  if (
    mensaje.includes("Renovación o refrendación: $180.000") &&
    mensaje.includes("¿Deseas agendar tu cita?")
  ) {
    const body = quitarBloque(mensaje, /\n\n1️⃣ Sí\n2️⃣ No\s*$/);
    return sendReplyButtons(
      to,
      body,
      [
        { id: "1", title: "Agendar" },
        { id: "2", title: "No" },
      ],
      {
        footer: "Selecciona una opción",
        headerImage: "fachada",
      }
    );
  }

  if (mensaje.includes("También podemos ayudarte con:")) {
    const body = quitarBloque(
      mensaje,
      /\n\n1️⃣ Sacar la licencia por primera vez\n2️⃣ Información del proceso\n3️⃣ Hablar con asesor\n\nResponde con el número de la opción\.?$/
    );
    return sendReplyButtons(
      to,
      body,
      [
        { id: "1", title: "Primera vez" },
        { id: "2", title: "Información" },
        { id: "3", title: "Asesor" },
      ],
      { footer: "Toca una opción" }
    );
  }

  if (mensaje.includes("¿Deseas agendar tu atención?")) {
    const body = quitarBloque(mensaje, /\n\n1️⃣ Sí\n2️⃣ No\s*$/);
    return sendReplyButtons(to, body, [
      { id: "1", title: "Agendar" },
      { id: "2", title: "No" },
    ]);
  }

  if (mensaje.startsWith("Por favor confirma que los datos estén correctos:")) {
    const body = quitarBloque(
      mensaje,
      /\n\n1️⃣ Confirmar cita\n2️⃣ Corregir datos\s*$/
    );
    return sendReplyButtons(
      to,
      body,
      [
        { id: "1", title: "Confirmar cita" },
        { id: "2", title: "Corregir datos" },
      ],
      { footer: "Confirma con un toque" }
    );
  }

  if (
    mensaje.includes("Elige uno de los próximos días disponibles:") &&
    mensaje.includes("3️⃣ *Otro día*")
  ) {
    const body = mensaje.replace(
      /\n\nResponde con el número de la opción\.?\s*$/,
      ""
    );
    return sendReplyButtons(
      to,
      body,
      [
        { id: "1", title: "1" },
        { id: "2", title: "2" },
        { id: "3", title: "Otro día" },
      ],
      { footer: "Selecciona el día" }
    );
  }

  if (mensaje.includes("Elige un horario aproximado de llegada:")) {
    const filas = [];
    const regex = /(\d+)️⃣\s+([^\n]+)/g;
    let match;
    while ((match = regex.exec(mensaje)) !== null) {
      filas.push({
        id: match[1],
        title: match[2].trim().slice(0, 24),
      });
    }

    if (filas.length) {
      const body = mensaje.replace(
        /\n\nResponde con el número de la opción\.?\s*$/,
        ""
      );
      return sendList(to, body, "Elegir horario", filas, {
        sectionTitle: "Horarios",
      });
    }
  }

  if (mensaje.startsWith("Claro ✅ ¿Qué información deseas consultar?")) {
    return sendList(
      to,
      "Claro ✅ ¿Qué información deseas consultar?",
      "Ver opciones",
      [
        { id: "1", title: "Precios" },
        { id: "2", title: "Duración" },
        { id: "3", title: "Horarios" },
        { id: "4", title: "Medios de pago" },
        { id: "5", title: "Proceso paso a paso" },
        { id: "6", title: "Ubicación" },
        { id: "7", title: "Volver al inicio" },
      ],
      { sectionTitle: "Información CRC" }
    );
  }

  if (
    mensaje.includes("1️⃣ Confirmar cita") &&
    mensaje.includes("2️⃣ Corregir datos")
  ) {
    return sendReplyButtons(to, mensaje, [
      { id: "1", title: "Confirmar cita" },
      { id: "2", title: "Corregir datos" },
    ]);
  }

  return null;
}

async function sendTextPlain(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  return enviarPayload({
    messaging_product: "whatsapp",
    to: normalizarDestino(to),
    type: "text",
    text: { body: mensaje },
  });
}

async function sendText(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  try {
    const interactivo = await intentarMensajeInteractivo(to, mensaje);
    if (interactivo) return interactivo;
  } catch (error) {
    console.error(
      "⚠️ No se pudo enviar el menú interactivo; se enviará texto normal:",
      error.response?.data || error.message
    );
  }

  return sendTextPlain(to, mensaje);
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
  sendTextPlain,
  sendReplyButtons,
  sendList,
  sendImage,
  sendImageFile,
  sendDocument,
  uploadMediaFile,
};
