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

const CONTENT_BASE_URL = "https://content.twilio.com/v1/Content";
const contentSidCache = new Map();
const contentCreationPromises = new Map();
const fachadaEnviadaAt = new Map();
let contentIndexPromise = null;

function normalizarDestino(to) {
  const value = String(to || "").trim();
  if (value.startsWith("whatsapp:")) return value;
  const phone = value.replace(/\D/g, "");
  return `whatsapp:+${phone}`;
}

function twilioConfigurado() {
  return Boolean(
    accountSid &&
      authToken &&
      (from || messagingServiceSid)
  );
}

function senderParams() {
  if (messagingServiceSid) return { messagingServiceSid };
  return { from };
}

function getTwilioStatus() {
  return {
    configured: twilioConfigurado(),
    senderMode: messagingServiceSid ? "messaging_service" : from ? "from_number" : "none",
    contentTemplatesCached: contentSidCache.size,
    facadeUrlConfigured: Boolean(FACHADA_REPO_URL),
  };
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function contentRequest(url, options = {}) {
  if (!twilioConfigurado()) {
    throw new Error("Twilio no está configurado completamente");
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: basicAuthHeader(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
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

async function cargarIndiceContenido() {
  if (contentIndexPromise) return contentIndexPromise;

  contentIndexPromise = (async () => {
    try {
      const data = await contentRequest(`${CONTENT_BASE_URL}?PageSize=500`);
      for (const item of Array.isArray(data?.contents) ? data.contents : []) {
        const name = String(item?.friendly_name || item?.friendlyName || "").trim();
        const sid = String(item?.sid || "").trim();
        if (name && sid) contentSidCache.set(name, sid);
      }
      console.log(
        `🧩 Plantillas Twilio Content indexadas: ${contentSidCache.size}`
      );
    } catch (error) {
      // Si el listado falla todavía podemos crear la plantilla requerida.
      console.warn("⚠️ No se pudo listar Twilio Content:", error.message);
    }
  })();

  return contentIndexPromise;
}

function nombreQuickReply(cantidad) {
  return `crc_vip_qr_v2_${cantidad}`;
}

function nombreListPicker(cantidad) {
  return `crc_vip_list_v2_${cantidad}`;
}

async function obtenerOCrearQuickReply(cantidad) {
  const count = Math.max(1, Math.min(3, Number(cantidad) || 1));
  const friendlyName = nombreQuickReply(count);

  await cargarIndiceContenido();
  if (contentSidCache.has(friendlyName)) {
    return contentSidCache.get(friendlyName);
  }

  if (contentCreationPromises.has(friendlyName)) {
    return contentCreationPromises.get(friendlyName);
  }

  const promise = (async () => {
    const variables = { "1": "Selecciona una opción" };
    const actions = [];

    for (let i = 0; i < count; i += 1) {
      const titleKey = String(2 + i * 2);
      const idKey = String(3 + i * 2);
      variables[titleKey] = `Opción ${i + 1}`;
      variables[idKey] = String(i + 1);
      actions.push({
        title: `{{${titleKey}}}`,
        id: `{{${idKey}}}`,
      });
    }

    const data = await contentRequest(CONTENT_BASE_URL, {
      method: "POST",
      body: {
        friendly_name: friendlyName,
        language: "es",
        variables,
        types: {
          "twilio/text": { body: "{{1}}" },
          "twilio/quick-reply": {
            body: "{{1}}",
            actions,
          },
        },
      },
    });

    const sid = String(data?.sid || "").trim();
    if (!sid) throw new Error("Twilio no devolvió ContentSid para quick reply");
    contentSidCache.set(friendlyName, sid);
    console.log(`🆕 Quick Reply Twilio creado: ${friendlyName} ${sid}`);
    return sid;
  })();

  contentCreationPromises.set(friendlyName, promise);
  try {
    return await promise;
  } finally {
    contentCreationPromises.delete(friendlyName);
  }
}

async function obtenerOCrearListPicker(cantidad) {
  const count = Math.max(1, Math.min(10, Number(cantidad) || 1));
  const friendlyName = nombreListPicker(count);

  await cargarIndiceContenido();
  if (contentSidCache.has(friendlyName)) {
    return contentSidCache.get(friendlyName);
  }

  if (contentCreationPromises.has(friendlyName)) {
    return contentCreationPromises.get(friendlyName);
  }

  const promise = (async () => {
    const variables = {
      "1": "Selecciona una opción",
      "2": "Ver opciones",
    };
    const items = [];

    for (let i = 0; i < count; i += 1) {
      const itemKey = String(3 + i * 3);
      const idKey = String(4 + i * 3);
      const descriptionKey = String(5 + i * 3);
      variables[itemKey] = String(i + 1);
      variables[idKey] = String(i + 1);
      variables[descriptionKey] = "Toca para seleccionar";
      items.push({
        item: `{{${itemKey}}}`,
        id: `{{${idKey}}}`,
        description: `{{${descriptionKey}}}`,
      });
    }

    const data = await contentRequest(CONTENT_BASE_URL, {
      method: "POST",
      body: {
        friendly_name: friendlyName,
        language: "es",
        variables,
        types: {
          "twilio/text": { body: "{{1}}" },
          "twilio/list-picker": {
            body: "{{1}}",
            button: "{{2}}",
            items,
          },
        },
      },
    });

    const sid = String(data?.sid || "").trim();
    if (!sid) throw new Error("Twilio no devolvió ContentSid para list picker");
    contentSidCache.set(friendlyName, sid);
    console.log(`🆕 List Picker Twilio creado: ${friendlyName} ${sid}`);
    return sid;
  })();

  contentCreationPromises.set(friendlyName, promise);
  try {
    return await promise;
  } finally {
    contentCreationPromises.delete(friendlyName);
  }
}

function limpiarBoton(value, max = 20) {
  const text = String(value || "").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function limpiarId(value) {
  return String(value || "").trim().slice(0, 180);
}

async function sendTwilioQuickReply(to, body, buttons) {
  const opciones = (Array.isArray(buttons) ? buttons : [])
    .slice(0, 3)
    .map((item) => ({
      title: limpiarBoton(item.title),
      id: limpiarId(item.id),
    }))
    .filter((item) => item.title && item.id);

  const texto = String(body || "").trim().slice(0, 1024);
  if (!texto || !opciones.length) return null;
  if (!twilioConfigurado()) return sendTwilioTextPlain(to, texto);

  const contentSid = await obtenerOCrearQuickReply(opciones.length);
  const variables = { "1": texto };

  opciones.forEach((item, index) => {
    variables[String(2 + index * 2)] = item.title;
    variables[String(3 + index * 2)] = item.id;
  });

  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    contentSid,
    contentVariables: JSON.stringify(variables),
  });

  console.log(
    "🔘 Quick Reply enviado por Twilio:",
    normalizarDestino(to),
    opciones.map((item) => item.title).join(" | "),
    message?.sid || ""
  );
  return message;
}

async function sendTwilioListPicker(to, body, buttonText, rows) {
  const items = (Array.isArray(rows) ? rows : [])
    .slice(0, 10)
    .map((item) => ({
      title: String(item.title || "").trim().slice(0, 24),
      id: limpiarId(item.id),
      description: String(item.description || "Toca para seleccionar")
        .trim()
        .slice(0, 72),
    }))
    .filter((item) => item.title && item.id);

  const texto = String(body || "").trim().slice(0, 1024);
  const boton = String(buttonText || "Ver opciones").trim().slice(0, 20);
  if (!texto || !items.length) return null;
  if (!twilioConfigurado()) return sendTwilioTextPlain(to, texto);

  const contentSid = await obtenerOCrearListPicker(items.length);
  const variables = {
    "1": texto,
    "2": boton || "Ver opciones",
  };

  items.forEach((item, index) => {
    variables[String(3 + index * 3)] = item.title;
    variables[String(4 + index * 3)] = item.id;
    variables[String(5 + index * 3)] = item.description;
  });

  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    contentSid,
    contentVariables: JSON.stringify(variables),
  });

  console.log(
    "📋 List Picker enviado por Twilio:",
    normalizarDestino(to),
    `${items.length} opciones`,
    message?.sid || ""
  );
  return message;
}

async function sendTwilioTextPlain(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  if (!twilioConfigurado()) {
    console.log("⚠️ Twilio no configurado. Mensaje:", mensaje);
    return null;
  }

  return client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    body: mensaje,
  });
}

async function sendTwilioMedia(to, body, mediaUrl) {
  const mensaje = String(body || "").trim();
  const url = String(mediaUrl || "").trim();

  if (!url) return sendTwilioTextPlain(to, mensaje);

  if (!twilioConfigurado()) {
    console.log("⚠️ Twilio no configurado. Adjunto omitido:", url);
    return null;
  }

  const message = await client.messages.create({
    ...senderParams(),
    to: normalizarDestino(to),
    body: mensaje || undefined,
    mediaUrl: [url],
  });

  console.log(
    "🖼️ Adjunto enviado directamente por Twilio:",
    normalizarDestino(to),
    message?.sid || ""
  );
  return message;
}

async function enviarFachadaSiCorresponde(to) {
  const key = normalizarDestino(to);
  const now = Date.now();
  const last = fachadaEnviadaAt.get(key) || 0;
  if (now - last < 30 * 60 * 1000) return null;

  try {
    const result = await sendTwilioMedia(
      to,
      "📍 Guía para ubicar nuestra sede\nVIP CRC Galerías — Cra. 28A #51-70, barrio Galerías, Bogotá.\n🚗 Contamos con parqueadero.",
      FACHADA_REPO_URL
    );
    fachadaEnviadaAt.set(key, now);
    return result;
  } catch (error) {
    console.error("⚠️ No se pudo enviar la fachada por Twilio:", error.message);
    return null;
  }
}

function quitarFinal(mensaje, regex) {
  return String(mensaje || "").replace(regex, "").trim();
}

function construirFilasHorario(mensaje) {
  const rows = [];
  const regex = /(\d+)️⃣\s+([^\n]+)/g;
  let match;

  while ((match = regex.exec(String(mensaje || ""))) !== null) {
    const numero = String(match[1]);
    const detalle = String(match[2] || "").trim();
    const esOtro = /otro horario/i.test(detalle);
    rows.push({
      id: numero,
      title: esOtro ? "Otro horario" : numero,
      description: esOtro ? "Escribir un horario diferente" : detalle,
    });
  }

  return rows;
}

async function intentarMensajeInteractivoTwilio(to, mensaje) {
  const text = String(mensaje || "").trim();

  if (text.includes("¿Estás interesado(a) en *renovar tu licencia de conducción*?")) {
    const body = quitarFinal(
      text,
      /\n\n1️⃣ Sí\n2️⃣ No\n\nResponde con el número de la opción\.?$/
    );
    return sendTwilioQuickReply(to, body, [
      { id: "1", title: "Sí" },
      { id: "2", title: "No" },
    ]);
  }

  if (
    text.includes("Renovación o refrendación: $180.000") &&
    text.includes("¿Deseas agendar tu cita?")
  ) {
    await enviarFachadaSiCorresponde(to);
    const body = quitarFinal(text, /\n\n1️⃣ Sí\n2️⃣ No\s*$/);
    return sendTwilioQuickReply(to, body, [
      { id: "1", title: "Agendar" },
      { id: "2", title: "No" },
    ]);
  }

  if (text.includes("También podemos ayudarte con:")) {
    const body = quitarFinal(
      text,
      /\n\n1️⃣ Sacar la licencia por primera vez\n2️⃣ Información del proceso\n3️⃣ Hablar con asesor\n\nResponde con el número de la opción\.?$/
    );
    return sendTwilioQuickReply(to, body, [
      { id: "1", title: "Primera vez" },
      { id: "2", title: "Información" },
      { id: "3", title: "Asesor" },
    ]);
  }

  if (text.includes("¿Deseas agendar tu atención?")) {
    const body = quitarFinal(text, /\n\n1️⃣ Sí\n2️⃣ No\s*$/);
    return sendTwilioQuickReply(to, body, [
      { id: "1", title: "Agendar" },
      { id: "2", title: "No" },
    ]);
  }

  if (
    text.startsWith("Por favor confirma que los datos estén correctos:") ||
    (text.includes("1️⃣ Confirmar cita") && text.includes("2️⃣ Corregir datos"))
  ) {
    const body = quitarFinal(
      text,
      /\n\n1️⃣ Confirmar cita\n2️⃣ Corregir datos\s*$/
    );
    return sendTwilioQuickReply(to, body || "Por favor selecciona una opción:", [
      { id: "1", title: "Confirmar cita" },
      { id: "2", title: "Corregir datos" },
    ]);
  }

  if (
    text.includes("Elige uno de los próximos días disponibles:") &&
    text.includes("3️⃣ *Otro día*")
  ) {
    const body = quitarFinal(
      text,
      /\n\nResponde con el número de la opción\.?\s*$/
    );
    return sendTwilioQuickReply(to, body, [
      { id: "1", title: "1" },
      { id: "2", title: "2" },
      { id: "3", title: "Otro día" },
    ]);
  }

  if (text.includes("Elige un horario aproximado de llegada:")) {
    const rows = construirFilasHorario(text);
    if (rows.length) {
      const prefix = text.split("Elige un horario aproximado de llegada:")[0].trim();
      const body = `${prefix}\n\nElige un horario aproximado de llegada:`;
      return sendTwilioListPicker(to, body, "Elegir horario", rows);
    }
  }

  if (text.includes("Claro ✅ ¿Qué información deseas consultar?")) {
    const marker = "Claro ✅ ¿Qué información deseas consultar?";
    const index = text.lastIndexOf(marker);
    const prefix = index > 0 ? `${text.slice(0, index).trim()}\n\n` : "";
    const body = `${prefix}${marker}`;
    return sendTwilioListPicker(to, body, "Ver opciones", [
      { id: "1", title: "1", description: "Precios" },
      { id: "2", title: "2", description: "Duración del proceso" },
      { id: "3", title: "3", description: "Horarios de atención" },
      { id: "4", title: "4", description: "Medios de pago" },
      { id: "5", title: "5", description: "Proceso paso a paso" },
      { id: "6", title: "6", description: "Ubicación" },
      { id: "7", title: "7", description: "Volver al inicio" },
    ]);
  }

  if (text.includes("1️⃣ Sí, usar ese día")) {
    const body = quitarFinal(text, /\n\n1️⃣ Sí, usar ese día\n\nO escríbeme otra fecha\.?$/);
    return sendTwilioQuickReply(to, body, [{ id: "1", title: "1" }]);
  }

  return null;
}

async function sendTwilioText(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  try {
    const interactive = await intentarMensajeInteractivoTwilio(to, mensaje);
    if (interactive) return interactive;
  } catch (error) {
    console.error(
      "⚠️ Twilio interactivo falló; se enviará texto normal:",
      error.message
    );
  }

  return sendTwilioTextPlain(to, mensaje);
}

module.exports = {
  sendTwilioText,
  sendTwilioTextPlain,
  sendTwilioMedia,
  sendTwilioQuickReply,
  sendTwilioListPicker,
  twilioConfigurado,
  getTwilioStatus,
  FACHADA_REPO_URL,
};
