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

const FACHADA_RENDER_URL =
  String(process.env.CRC_FACHADA_URL || "").trim() ||
  `${PUBLIC_URL}/media/fachada-crc-vip.jpg?v=20260826`;

const FACHADA_REPO_URL =
  "https://raw.githubusercontent.com/CristianG1h/Bot-WhatsApp-CRC-VIP/main/src/assets/fachada-crc-vip.jpg";

const CAPTION =
  "📍 Guía para ubicar nuestra sede\nVIP CRC Galerías — Cra. 28A #51-70, barrio Galerías, Bogotá.\n🚗 Contamos con parqueadero.";

let lastDelivery = {
  strategy: "media_url",
  messageSid: null,
  mediaUrl: null,
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

async function crearMensajeMedia(to, mediaUrl) {
  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    body: CAPTION,
    mediaUrl: [mediaUrl],
  });

  lastDelivery = {
    strategy: "media_url",
    messageSid: message?.sid || null,
    mediaUrl,
    status: message?.status || null,
    errorCode: message?.errorCode || null,
    errorMessage: message?.errorMessage || null,
    checkedAt: new Date().toISOString(),
  };

  console.log(
    "🏢 Fachada enviada por MediaUrl:",
    normalizarDestino(to),
    message?.sid || "sin SID",
    `status=${message?.status || "unknown"}`,
    mediaUrl
  );

  return message;
}

async function verificarEntrega(messageSid, to, mediaUrl, permitirRepoFallback) {
  if (!messageSid) return;

  for (const pausa of [1500, 3500, 7000]) {
    await esperar(pausa);

    try {
      const actual = await client.messages(messageSid).fetch();

      lastDelivery = {
        strategy: "media_url",
        messageSid,
        mediaUrl,
        status: actual?.status || null,
        errorCode: actual?.errorCode || null,
        errorMessage: actual?.errorMessage || null,
        checkedAt: new Date().toISOString(),
      };

      console.log(
        "🔎 Estado foto Twilio:",
        messageSid,
        `status=${actual?.status || "unknown"}`,
        actual?.errorCode ? `errorCode=${actual.errorCode}` : "",
        actual?.errorMessage ? `error=${actual.errorMessage}` : ""
      );

      const estado = String(actual?.status || "");
      if (["delivered", "read"].includes(estado)) return;

      if (["failed", "undelivered"].includes(estado)) {
        if (permitirRepoFallback && mediaUrl !== FACHADA_REPO_URL) {
          try {
            console.warn(
              "🛟 MediaUrl principal falló; reintentando fachada desde GitHub RAW"
            );
            const fallback = await crearMensajeMedia(to, FACHADA_REPO_URL);
            void verificarEntrega(
              fallback?.sid,
              to,
              FACHADA_REPO_URL,
              false
            );
          } catch (fallbackError) {
            console.error(
              "❌ También falló el envío de fachada desde GitHub RAW:",
              fallbackError.message
            );
          }
        }
        return;
      }
    } catch (error) {
      console.error("⚠️ No se pudo consultar estado de la foto:", error.message);
      return;
    }
  }
}

async function sendFacadeMedia(to) {
  if (!configurado()) {
    throw new Error("Twilio no está configurado completamente");
  }

  let message;
  try {
    message = await crearMensajeMedia(to, FACHADA_RENDER_URL);
  } catch (error) {
    console.error(
      "⚠️ No se pudo crear mensaje con MediaUrl de Render; probando GitHub RAW:",
      error.message
    );
    message = await crearMensajeMedia(to, FACHADA_REPO_URL);
    void verificarEntrega(message?.sid, to, FACHADA_REPO_URL, false);
    return message;
  }

  void verificarEntrega(message?.sid, to, FACHADA_RENDER_URL, true);
  return message;
}

function getFacadeStatus() {
  return {
    configured: configurado(),
    strategy: "media_url_session_message",
    templateUsed: false,
    mediaUrl: FACHADA_RENDER_URL,
    fallbackMediaUrl: FACHADA_REPO_URL,
    lastDelivery,
  };
}

module.exports = {
  sendFacadeMedia,
  // Alias temporal para no romper el hook existente mientras se despliega.
  sendFacadeViaContent: sendFacadeMedia,
  getFacadeStatus,
  FACHADA_RENDER_URL,
  FACHADA_REPO_URL,
};
