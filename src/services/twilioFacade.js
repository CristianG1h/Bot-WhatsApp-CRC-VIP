"use strict";

const twilio = require("twilio");

const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const from = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
const messagingServiceSid = String(
  process.env.TWILIO_MESSAGING_SERVICE_SID || ""
).trim();

const client = twilio(accountSid || undefined, authToken || undefined);

const FACHADA_REPO_URL =
  "https://raw.githubusercontent.com/CristianG1h/Bot-WhatsApp-CRC-VIP/main/src/assets/fachada-crc-vip.jpg";
const FACHADA_PUBLIC_URL = String(process.env.CRC_FACHADA_URL || "").trim() ||
  (String(process.env.PUBLIC_URL || "").trim()
    ? `${String(process.env.PUBLIC_URL).replace(/\/$/, "")}/media/fachada-crc-vip.jpg`
    : FACHADA_REPO_URL);

const CONTENT_URL = "https://content.twilio.com/v1/Content";
const FRIENDLY_NAME = "crc_vip_fachada_media_v1";
let contentSid = null;
let pendingContentSid = null;

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

function authHeader() {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function requestContent(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: authHeader(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(`Twilio Content API ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function buscarContentSidExistente() {
  const data = await requestContent(`${CONTENT_URL}?PageSize=500`);
  const contents = Array.isArray(data?.contents) ? data.contents : [];
  const found = contents.find(
    (item) => String(item?.friendly_name || item?.friendlyName || "") === FRIENDLY_NAME
  );
  return found?.sid ? String(found.sid) : null;
}

async function obtenerContentSid() {
  if (contentSid) return contentSid;
  if (pendingContentSid) return pendingContentSid;

  pendingContentSid = (async () => {
    try {
      const existing = await buscarContentSidExistente();
      if (existing) {
        contentSid = existing;
        console.log("🖼️ Plantilla Twilio Media reutilizada:", FRIENDLY_NAME, existing);
        return existing;
      }
    } catch (error) {
      console.warn("⚠️ No se pudo buscar plantilla de fachada:", error.message);
    }

    const data = await requestContent(CONTENT_URL, {
      method: "POST",
      body: {
        friendly_name: FRIENDLY_NAME,
        language: "es",
        variables: {
          "1": "Guía para ubicar VIP CRC Galerías",
        },
        types: {
          "twilio/text": {
            body: "{{1}}",
          },
          "twilio/media": {
            body: "{{1}}",
            media: [FACHADA_PUBLIC_URL],
          },
        },
      },
    });

    const sid = String(data?.sid || "").trim();
    if (!sid) throw new Error("Twilio no devolvió ContentSid para la fachada");
    contentSid = sid;
    console.log("🆕 Plantilla Twilio Media creada:", FRIENDLY_NAME, sid);
    return sid;
  })();

  try {
    return await pendingContentSid;
  } finally {
    pendingContentSid = null;
  }
}

async function sendFacadeViaContent(to) {
  if (!configurado()) {
    throw new Error("Twilio no está configurado completamente");
  }

  const sid = await obtenerContentSid();
  const caption =
    "📍 Guía para ubicar nuestra sede\nVIP CRC Galerías — Cra. 28A #51-70, barrio Galerías, Bogotá.\n🚗 Contamos con parqueadero.";

  try {
    const message = await client.messages.create({
      ...senderParams(),
      to: normalizarDestino(to),
      contentSid: sid,
      contentVariables: JSON.stringify({ "1": caption }),
    });

    console.log(
      "🏢 Fachada enviada con Twilio Content Media:",
      normalizarDestino(to),
      message?.sid || "sin SID",
      `status=${message?.status || "unknown"}`
    );
    return message;
  } catch (error) {
    console.error("⚠️ Twilio Content Media fachada falló:", error.message);

    // Respaldo final: MediaUrl clásico. La URL pública de Render se prefiere
    // porque Express la sirve con MIME image/jpeg; si PUBLIC_URL no existe,
    // se usa el JPG RAW versionado en GitHub.
    const message = await client.messages.create({
      ...senderParams(),
      to: normalizarDestino(to),
      body: caption,
      mediaUrl: [FACHADA_PUBLIC_URL],
    });

    console.log(
      "🏢 Fachada enviada por MediaUrl de respaldo:",
      normalizarDestino(to),
      message?.sid || "sin SID",
      `status=${message?.status || "unknown"}`
    );
    return message;
  }
}

function getFacadeStatus() {
  return {
    configured: configurado(),
    contentSidCached: Boolean(contentSid),
    publicUrl: FACHADA_PUBLIC_URL,
  };
}

module.exports = {
  sendFacadeViaContent,
  getFacadeStatus,
  FACHADA_PUBLIC_URL,
};
