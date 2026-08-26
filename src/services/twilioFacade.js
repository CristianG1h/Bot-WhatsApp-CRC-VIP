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

// URL directa de la fotografía publicada por Google. Esta es la primera opción
// porque Google entrega la imagen desde su CDN y evita depender del archivo
// comprimido/versionado del repositorio.
const FACHADA_GOOGLE_URL =
  "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWm8v9-g_UnUaV3mHMz1MnHMLWNDh9Kl44sYw-qDvMyTTOs0W6BMC96-RL175Mlc8jCqP_RuZOs1Nj5rW4bxJTm2T8AkdYei19b9Fcd8A1_a44VCoAeHPlwYZ927ukIRnwfUE7yT=s680-w680-h510-rw";

// Si en Render se define CRC_FACHADA_URL se puede cambiar la foto sin tocar
// el código. Si no existe, usamos la URL directa de Google proporcionada.
const FACHADA_PRIMARY_URL =
  String(process.env.CRC_FACHADA_URL || "").trim() || FACHADA_GOOGLE_URL;

// Respaldos controlados por nosotros.
const FACHADA_RENDER_URL = `${PUBLIC_URL}/media/fachada.jpg`;
const FACHADA_REPO_URL =
  "https://raw.githubusercontent.com/CristianG1h/Bot-WhatsApp-CRC-VIP/main/src/assets/fachada-crc-vip.jpg";

const MEDIA_URLS = [
  FACHADA_PRIMARY_URL,
  FACHADA_RENDER_URL,
  FACHADA_REPO_URL,
].filter((url, index, all) => url && all.indexOf(url) === index);

let lastDelivery = {
  strategy: "media_url_image_only",
  messageSid: null,
  mediaUrl: null,
  status: null,
  errorCode: null,
  errorMessage: null,
  checkedAt: null,
  attempt: null,
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

async function crearMensajeMedia(to, mediaUrl, attempt) {
  // La imagen se manda SOLA. El mensaje comercial que sigue ya contiene la
  // ubicación y los botones. Esto elimina cualquier posible validación de
  // WhatsApp sobre una combinación body + media.
  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    mediaUrl: [mediaUrl],
  });

  lastDelivery = {
    strategy: "media_url_image_only",
    messageSid: message?.sid || null,
    mediaUrl,
    status: message?.status || null,
    errorCode: message?.errorCode || null,
    errorMessage: message?.errorMessage || null,
    checkedAt: new Date().toISOString(),
    attempt,
  };

  console.log(
    "🏢 Fachada enviada por MediaUrl (imagen sola):",
    normalizarDestino(to),
    message?.sid || "sin SID",
    `status=${message?.status || "unknown"}`,
    `attempt=${attempt}`,
    mediaUrl
  );

  return message;
}

async function enviarSiguienteIntento(to, index) {
  if (index >= MEDIA_URLS.length) {
    console.error("❌ Se agotaron las URLs disponibles para enviar la fachada");
    return null;
  }

  const mediaUrl = MEDIA_URLS[index];
  const attempt = index + 1;

  try {
    const message = await crearMensajeMedia(to, mediaUrl, attempt);
    void verificarEntrega(message?.sid, to, index);
    return message;
  } catch (error) {
    console.error(
      `⚠️ No se pudo crear mensaje de fachada con intento ${attempt}:`,
      error.message
    );
    return enviarSiguienteIntento(to, index + 1);
  }
}

async function verificarEntrega(messageSid, to, currentIndex) {
  if (!messageSid) return;

  for (const pausa of [1500, 3500, 7000]) {
    await esperar(pausa);

    try {
      const actual = await client.messages(messageSid).fetch();
      const mediaUrl = MEDIA_URLS[currentIndex] || null;

      lastDelivery = {
        strategy: "media_url_image_only",
        messageSid,
        mediaUrl,
        status: actual?.status || null,
        errorCode: actual?.errorCode || null,
        errorMessage: actual?.errorMessage || null,
        checkedAt: new Date().toISOString(),
        attempt: currentIndex + 1,
      };

      console.log(
        "🔎 Estado foto Twilio:",
        messageSid,
        `status=${actual?.status || "unknown"}`,
        `attempt=${currentIndex + 1}`,
        actual?.errorCode ? `errorCode=${actual.errorCode}` : "",
        actual?.errorMessage ? `error=${actual.errorMessage}` : ""
      );

      const estado = String(actual?.status || "");
      if (["delivered", "read"].includes(estado)) return;

      if (["failed", "undelivered"].includes(estado)) {
        if (currentIndex + 1 < MEDIA_URLS.length) {
          console.warn(
            `🛟 Foto no entregada; probando URL ${currentIndex + 2} de ${MEDIA_URLS.length}`
          );
          await enviarSiguienteIntento(to, currentIndex + 1);
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

  return enviarSiguienteIntento(to, 0);
}

function getFacadeStatus() {
  return {
    configured: configurado(),
    strategy: "media_url_image_only",
    templateUsed: false,
    primarySource: FACHADA_PRIMARY_URL === FACHADA_GOOGLE_URL ? "googleusercontent" : "env",
    mediaUrl: FACHADA_PRIMARY_URL,
    fallbacks: MEDIA_URLS.slice(1),
    lastDelivery,
  };
}

module.exports = {
  sendFacadeMedia,
  // Alias temporal para no romper el hook existente.
  sendFacadeViaContent: sendFacadeMedia,
  getFacadeStatus,
  FACHADA_PRIMARY_URL,
  FACHADA_RENDER_URL,
  FACHADA_REPO_URL,
};
