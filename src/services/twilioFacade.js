"use strict";

const twilio = require("twilio");

const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const from = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
const messagingServiceSid = String(
  process.env.TWILIO_MESSAGING_SERVICE_SID || ""
).trim();

const client = twilio(accountSid || undefined, authToken || undefined);

const DEFAULT_PUBLIC_URL = "https://bot-whatsapp-crc-vip.onrender.com";
const PUBLIC_URL = String(process.env.PUBLIC_URL || DEFAULT_PUBLIC_URL)
  .trim()
  .replace(/\/$/, "");

const FACHADA_PAGE_URL = `${PUBLIC_URL}/sede-crc`;

let lastDelivery = {
  strategy: "link_preview",
  messageSid: null,
  url: FACHADA_PAGE_URL,
  status: null,
  errorCode: null,
  errorMessage: null,
  checkedAt: null,
};

function configurado() {
  return Boolean(accountSid && authToken && (from || messagingServiceSid));
}

function senderParams() {
  return messagingServiceSid ? { messagingServiceSid } : { from };
}

function normalizarDestino(to) {
  const value = String(to || "").trim();
  if (value.startsWith("whatsapp:")) return value;
  return `whatsapp:+${value.replace(/\D/g, "")}`;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verificarEntrega(messageSid) {
  if (!messageSid) return;

  for (const pausa of [1500, 3500, 7000]) {
    await esperar(pausa);
    try {
      const actual = await client.messages(messageSid).fetch();
      lastDelivery = {
        strategy: "link_preview",
        messageSid,
        url: FACHADA_PAGE_URL,
        status: actual?.status || null,
        errorCode: actual?.errorCode || null,
        errorMessage: actual?.errorMessage || null,
        checkedAt: new Date().toISOString(),
      };

      console.log(
        "🔎 Estado guía visual Twilio:",
        messageSid,
        `status=${actual?.status || "unknown"}`,
        actual?.errorCode ? `errorCode=${actual.errorCode}` : "",
        actual?.errorMessage ? `error=${actual.errorMessage}` : ""
      );

      const estado = String(actual?.status || "");
      if (["delivered", "read", "failed", "undelivered"].includes(estado)) return;
    } catch (error) {
      console.error("⚠️ No se pudo consultar estado de la guía visual:", error.message);
      return;
    }
  }
}

async function sendFacadeMedia(to) {
  if (!configurado()) {
    throw new Error("Twilio no está configurado completamente");
  }

  // Después de varios rechazos 63021 de Meta usando MediaUrl y twilio/media,
  // usamos el mecanismo soportado de vista previa de enlaces de WhatsApp.
  // Es un mensaje free-form normal dentro de la ventana de 24 horas y NO usa
  // plantilla ni adjunto multimedia. WhatsApp genera el preview de la página,
  // cuya etiqueta og:image apunta a la foto real de la fachada.
  const body = [
    "📍 *Guía para ubicar nuestra sede*",
    "Esta es la referencia visual de *VIP CRC Galerías*:",
    FACHADA_PAGE_URL,
    "Cra. 28A #51-70, barrio Galerías – Bogotá.",
    "🚗 Contamos con parqueadero.",
  ].join("\n");

  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    body,
  });

  lastDelivery = {
    strategy: "link_preview",
    messageSid: message?.sid || null,
    url: FACHADA_PAGE_URL,
    status: message?.status || null,
    errorCode: message?.errorCode || null,
    errorMessage: message?.errorMessage || null,
    checkedAt: new Date().toISOString(),
  };

  console.log(
    "🖼️ Guía visual enviada como link preview:",
    normalizarDestino(to),
    message?.sid || "sin SID",
    `status=${message?.status || "unknown"}`,
    FACHADA_PAGE_URL
  );

  void verificarEntrega(message?.sid);
  return message;
}

function getFacadeStatus() {
  return {
    configured: configurado(),
    strategy: "link_preview",
    templateUsed: false,
    mediaAttachmentUsed: false,
    pageUrl: FACHADA_PAGE_URL,
    lastDelivery,
  };
}

module.exports = {
  sendFacadeMedia,
  // Conservamos el alias para no romper mediaHooks.js.
  sendFacadeViaContent: sendFacadeMedia,
  getFacadeStatus,
  FACHADA_PAGE_URL,
};
