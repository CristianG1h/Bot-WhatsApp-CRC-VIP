"use strict";

const twilio = require("twilio");

const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const from = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
const messagingServiceSid = String(
  process.env.TWILIO_MESSAGING_SERVICE_SID || ""
).trim();

const client = twilio(accountSid || undefined, authToken || undefined);

// Twilio usa raw.githubusercontent.com en sus propios ejemplos de twilio/media.
// Mantenemos una URL estática, pública y con extensión .jpg.
const FACHADA_REPO_URL =
  "https://raw.githubusercontent.com/CristianG1h/Bot-WhatsApp-CRC-VIP/main/src/assets/fachada-crc-vip.jpg";
const FACHADA_RENDER_URL = String(process.env.PUBLIC_URL || "").trim()
  ? `${String(process.env.PUBLIC_URL).replace(/\/$/, "")}/media/fachada-crc-vip.jpg`
  : "";

const CONTENT_URL = "https://content.twilio.com/v1/Content";
const FRIENDLY_NAME = "crc_vip_fachada_media_v1";
const CAPTION =
  "📍 Guía para ubicar nuestra sede\nVIP CRC Galerías — Cra. 28A #51-70, barrio Galerías, Bogotá.\n🚗 Contamos con parqueadero.";

let contentSid = null;
let pendingContentSid = null;
let templateNormalized = false;
let lastDelivery = {
  messageSid: null,
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

function authHeader() {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function requestContent(url, options = {}) {
  if (!configurado()) {
    throw new Error("Twilio no está configurado completamente");
  }

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

function payloadPlantillaMedia() {
  // Importante: esta plantilla contiene SOLO twilio/media.
  // La versión anterior tenía twilio/text + twilio/media y una variable {{1}}.
  // Para la fachada no necesitamos ninguna variable ni fallback de texto.
  return {
    friendly_name: FRIENDLY_NAME,
    types: {
      "twilio/media": {
        body: CAPTION,
        media: [FACHADA_REPO_URL],
      },
    },
  };
}

async function buscarContentSidExistente() {
  const data = await requestContent(`${CONTENT_URL}?PageSize=500`);
  const contents = Array.isArray(data?.contents) ? data.contents : [];
  const found = contents.find(
    (item) => String(item?.friendly_name || item?.friendlyName || "") === FRIENDLY_NAME
  );
  return found?.sid ? String(found.sid) : null;
}

async function normalizarPlantillaExistente(sid) {
  // En la captura de Twilio la plantilla está "Not submitted", por lo que
  // Twilio permite editarla sin cambiar el ContentSid. Esto evita crear más
  // plantillas y corrige la v1 existente en el mismo lugar.
  await requestContent(`${CONTENT_URL}/${sid}`, {
    method: "PUT",
    body: {
      ...payloadPlantillaMedia(),
      variables: {},
    },
  });

  templateNormalized = true;
  console.log(
    "🧹 Plantilla de fachada normalizada (solo twilio/media):",
    FRIENDLY_NAME,
    sid
  );
  return sid;
}

async function crearPlantillaMedia() {
  const data = await requestContent(CONTENT_URL, {
    method: "POST",
    body: {
      ...payloadPlantillaMedia(),
      language: "es",
    },
  });

  const sid = String(data?.sid || "").trim();
  if (!sid) throw new Error("Twilio no devolvió ContentSid para la fachada");

  templateNormalized = true;
  console.log("🆕 Plantilla Twilio Media creada:", FRIENDLY_NAME, sid);
  return sid;
}

async function obtenerContentSid() {
  if (contentSid) return contentSid;
  if (pendingContentSid) return pendingContentSid;

  pendingContentSid = (async () => {
    let existing = null;

    try {
      existing = await buscarContentSidExistente();
    } catch (error) {
      console.warn("⚠️ No se pudo buscar plantilla de fachada:", error.message);
    }

    if (existing) {
      // Reparamos automáticamente la plantilla que ya ves en Twilio.
      contentSid = await normalizarPlantillaExistente(existing);
      return contentSid;
    }

    contentSid = await crearPlantillaMedia();
    return contentSid;
  })();

  try {
    return await pendingContentSid;
  } finally {
    pendingContentSid = null;
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarMediaUrlFallback(to) {
  const url = FACHADA_RENDER_URL || FACHADA_REPO_URL;

  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    body: CAPTION,
    mediaUrl: [url],
  });

  console.log(
    "🛟 Fachada enviada por MediaUrl de respaldo:",
    normalizarDestino(to),
    message?.sid || "sin SID",
    url
  );

  return message;
}

async function verificarEntrega(messageSid, to, permitirFallback = true) {
  if (!messageSid) return;

  const pausas = [1500, 3500, 7000];

  for (const pausa of pausas) {
    await esperar(pausa);

    try {
      const actual = await client.messages(messageSid).fetch();
      lastDelivery = {
        messageSid,
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

      if (["delivered", "read"].includes(String(actual?.status || ""))) {
        return;
      }

      if (["failed", "undelivered"].includes(String(actual?.status || ""))) {
        if (permitirFallback) {
          try {
            const fallback = await enviarMediaUrlFallback(to);
            void verificarEntrega(fallback?.sid, to, false);
          } catch (fallbackError) {
            console.error(
              "❌ También falló el MediaUrl de respaldo:",
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

async function sendFacadeViaContent(to) {
  if (!configurado()) {
    throw new Error("Twilio no está configurado completamente");
  }

  const sid = await obtenerContentSid();

  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    contentSid: sid,
  });

  lastDelivery = {
    messageSid: message?.sid || null,
    status: message?.status || null,
    errorCode: message?.errorCode || null,
    errorMessage: message?.errorMessage || null,
    checkedAt: new Date().toISOString(),
  };

  console.log(
    "🏢 Fachada enviada con Twilio Content Media:",
    normalizarDestino(to),
    message?.sid || "sin SID",
    `status=${message?.status || "unknown"}`,
    `contentSid=${sid}`
  );

  // Twilio devuelve normalmente "queued" al crear el mensaje. Consultamos el
  // estado real en segundo plano para detectar failed/undelivered y mostrar el
  // error concreto en Render sin frenar el flujo del bot.
  void verificarEntrega(message?.sid, to, true);

  return message;
}

function getFacadeStatus() {
  return {
    configured: configurado(),
    templateName: FRIENDLY_NAME,
    contentSidCached: contentSid,
    templateNormalized,
    mediaUrl: FACHADA_REPO_URL,
    fallbackMediaUrl: FACHADA_RENDER_URL || FACHADA_REPO_URL,
    lastDelivery,
  };
}

module.exports = {
  sendFacadeViaContent,
  getFacadeStatus,
  FACHADA_REPO_URL,
};
