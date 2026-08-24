"use strict";

const express = require("express");
const router = express.Router();

const Stats = require("../services/stats");
const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");
const { logIncomingMessage, logOutgoingMessage } = require("../services/chatwoot");
const { getSession } = require("../utils/sessions");
const { limpiarTexto } = require("../utils/validation");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const procesados = new Map();

function textoSeguroMeta(message) {
  return (
    message?.text?.body ||
    message?.interactive?.button_reply?.id ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.id ||
    message?.interactive?.list_reply?.title ||
    ""
  );
}

function extraerIncoming(req) {
  if (req.path === "/twilio") {
    const from = req.body?.From;
    const text = limpiarTexto(req.body?.Body || "");
    if (!from || !text) return null;

    return {
      from,
      text,
      source: "twilio",
      messageId: req.body?.MessageSid || req.body?.SmsMessageSid || null,
      skipIncomingNote: false,
    };
  }

  if (req.path === "/chatwoot") {
    const payload = req.body || {};
    const event = payload.event;
    const messageType = payload.message_type || payload.message?.message_type;
    const isPrivate = payload.private === true || payload.message?.private === true;

    if (
      isPrivate ||
      (event && event !== "message_created") ||
      messageType !== "incoming"
    ) {
      return null;
    }

    const expectedInboxId = Number(process.env.CHATWOOT_INBOX_ID || 0);
    const payloadInboxId =
      payload.inbox?.id ||
      payload.inbox_id ||
      payload.conversation?.inbox_id ||
      payload.conversation?.inbox?.id ||
      payload.message?.inbox_id ||
      payload.message?.inbox?.id ||
      payload.conversation?.meta?.inbox?.id ||
      payload.conversation?.contact_inbox?.inbox_id ||
      payload.contact_inbox?.inbox_id ||
      null;

    if (
      expectedInboxId &&
      (!payloadInboxId || Number(payloadInboxId) !== expectedInboxId)
    ) {
      return null;
    }

    const sender =
      payload.sender ||
      payload.message?.sender ||
      payload.conversation?.contact ||
      payload.contact ||
      {};
    const contact = payload.conversation?.contact || payload.contact || sender;
    const phone =
      sender.phone_number ||
      contact.phone_number ||
      payload.conversation?.meta?.sender?.phone_number ||
      payload.conversation?.contact_inbox?.source_id ||
      payload.contact_inbox?.source_id ||
      "";
    const text = limpiarTexto(payload.content || payload.message?.content || "");

    if (!phone || !text) return null;

    return {
      from: phone.startsWith("whatsapp:")
        ? phone
        : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`,
      text,
      source: "chatwoot",
      messageId:
        payload.id ||
        payload.message?.id ||
        payload.message_id ||
        payload.content_attributes?.external_id ||
        null,
      skipIncomingNote: true,
    };
  }

  if (req.path === "/") {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return null;

    const from = message.from;
    const text = limpiarTexto(textoSeguroMeta(message));
    if (!from || !text) return null;

    return {
      from,
      text,
      source: "meta",
      messageId: message.id || null,
      skipIncomingNote: false,
    };
  }

  return null;
}

function normalizarTelefono(valor) {
  return String(valor || "")
    .replace(/^whatsapp:/i, "")
    .replace(/\D/g, "");
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function esDuplicado({ from, text, source, messageId }) {
  const now = Date.now();

  if (messageId) {
    const idKey = `id:${messageId}`;
    const anteriorId = procesados.get(idKey);
    if (anteriorId && now - anteriorId.time < 60000) return true;
    procesados.set(idKey, { time: now, source, messageId });
  }

  const contentKey = `content:${normalizarTelefono(from)}::${normalizarTexto(text)}`;
  const anterior = procesados.get(contentKey);

  if (anterior && now - anterior.time < 5000) {
    const diferenteFuente = anterior.source !== source;
    const faltaId = !messageId || !anterior.messageId;
    if (diferenteFuente || faltaId) return true;
  }

  procesados.set(contentKey, { time: now, source, messageId });

  for (const [key, value] of procesados.entries()) {
    if (now - Number(value?.time || 0) > 120000) procesados.delete(key);
  }

  return false;
}

function pareceConsulta(text) {
  const t = normalizarTexto(text);
  if (!t) return false;
  if (String(text).includes("?")) return true;

  return /\b(que|quien|quienes|como|cuanto|cual|donde|cuando|por que|porque|puedo|pueden|sirve|vale|precio|costo|horario|pago|pagar|tarjeta|efectivo|nequi|categoria|licencia|examen|requisito|documento|parqueadero|direccion|ubicacion|demora|duracion|medico|vision|audicion|psicologia|renovacion|refrendacion|runt|simit|comparendo|multa|ustedes|centro|crc|directamente|transito)\b/.test(
    t
  );
}

function esEntradaPropiaDelPaso(step, text) {
  const t = String(text || "").trim().toLowerCase();

  if (/^[1-7]$/.test(t)) return true;
  if (
    [
      "si",
      "sí",
      "no",
      "ok",
      "okay",
      "dale",
      "claro",
      "menu",
      "menú",
      "inicio",
      "volver",
      "reiniciar",
    ].includes(t)
  ) {
    return true;
  }

  if (
    step === "DIA_PERSONALIZADO" &&
    (/\d{1,2}[\/-]\d{1,2}/.test(t) ||
      /\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/.test(
        t
      ))
  ) {
    return true;
  }

  if (
    step === "HORARIO_PERSONALIZADO" &&
    (/\d/.test(t) || /\b(manana|mañana|tarde)\b/.test(t))
  ) {
    return true;
  }

  if (step === "NOMBRE_CITA" && t.includes(" ") && !pareceConsulta(t)) {
    return true;
  }

  if (
    ["CEDULA_CITA", "TELEFONO_CITA"].includes(step) &&
    /\d{5,}/.test(t.replace(/\D/g, ""))
  ) {
    return true;
  }

  if (step === "CORREO_CITA" && t.includes("@")) return true;

  return false;
}

function continuacion(session) {
  switch (session.step) {
    case "RENOVACION_INTERES":
      return "\n\nPara continuar con el flujo:\n1️⃣ Sí, deseo renovar\n2️⃣ No";

    case "AGENDAR_RENOVACION":
    case "AGENDAR_PRIMERA_VEZ":
      return "\n\n¿Deseas agendar tu atención?\n1️⃣ Sí\n2️⃣ No";

    case "NO_RENOVACION":
      return "\n\nPara continuar:\n1️⃣ Primera vez\n2️⃣ Información del proceso\n3️⃣ Hablar con asesor";

    case "MENU_INFORMACION":
      return "\n\nPuedes seguir con el menú anterior o escribir otra pregunta.";

    case "DIA_CITA":
      return "\n\nCuando quieras continuar con la cita, responde *1, 2 o 3* según las opciones de fecha que te mostré.";

    case "DIA_PERSONALIZADO":
      return "\n\nCuando quieras continuar, escríbeme la fecha en la que deseas asistir.";

    case "HORARIO_CITA":
      return "\n\nCuando quieras continuar, responde con el número del horario que prefieres.";

    case "HORARIO_PERSONALIZADO":
      return "\n\nCuando quieras continuar, indícame el horario aproximado que prefieres.";

    case "NOMBRE_CITA":
      return "\n\nPara continuar con el agendamiento, envíame tu nombre completo.";

    case "CEDULA_CITA":
      return "\n\nPara continuar, envíame tu número de cédula.";

    case "TELEFONO_CITA":
      return "\n\nPara continuar, envíame tu número de celular.";

    case "CORREO_CITA":
      return "\n\nPara continuar, envíame tu correo electrónico.";

    case "CONFIRMAR_CITA":
      return "\n\nPara continuar:\n1️⃣ Confirmar cita\n2️⃣ Corregir datos";

    default:
      return "";
  }
}

function respuestaLocalSegura(text) {
  const t = normalizarTexto(text);

  if (/\b(quien|quienes)\b/.test(t) && /\b(son|ustedes|son ustedes)\b/.test(t)) {
    return `Somos *VIP CRC Galerías*, un Centro de Reconocimiento de Conductores en Bogotá.\n\nRealizamos las evaluaciones requeridas para trámites de licencia de conducción, como renovación/refrendación y primera vez. Estamos ubicados en *Cra. 28A #51-70, barrio Galerías – Bogotá*.`;
  }

  if (
    (/\b(sacan|saca|expiden|expide|entregan|entrega)\b/.test(t) &&
      /\blicencia\b/.test(t)) ||
    (t.includes("licencia directamente") && t.includes("donde"))
  ) {
    return `Nosotros realizamos en el CRC las *evaluaciones y la certificación de aptitud* necesarias para el trámite.\n\nLa licencia como documento final *no la expide el CRC*; después debes continuar el trámite ante el organismo de tránsito correspondiente. Si quieres, también puedo orientarte sobre el paso general después del examen.`;
  }

  if (/\b(donde|direccion|ubicacion|ubicados)\b/.test(t)) {
    return `Estamos en *VIP CRC Galerías*, Cra. 28A #51-70, barrio Galerías – Bogotá.\n\n🚗 También contamos con parqueadero.`;
  }

  if (/\b(parqueadero|parquear|estacionamiento)\b/.test(t)) {
    return `Sí ✅ *Contamos con parqueadero* en VIP CRC Galerías.`;
  }

  if (/\b(precio|costo|cuanto|vale|valor)\b/.test(t)) {
    return `La promoción de *renovación o refrendación de una categoría* es de *$180.000*.\n\nPara *dos categorías en combo*, el valor es de *$250.000*.`;
  }

  if (/\b(horario|hora|atienden|abren|cierran)\b/.test(t)) {
    return `Nuestro horario es:\n\n• Lunes a viernes: *7:00 a.m. a 3:30 p.m.*\n• Sábados: *7:00 a.m. a 11:30 a.m.*\n• Domingos y festivos: *no laboramos*.`;
  }

  if (/\b(demora|duracion|tarda|tiempo)\b/.test(t)) {
    return `El proceso del examen CRC normalmente tarda entre *40 y 60 minutos*, dependiendo del flujo de atención.`;
  }

  if (/\b(pago|pagar|tarjeta|efectivo|nequi|transferencia)\b/.test(t)) {
    return `Aceptamos diferentes medios de pago. Si necesitas confirmar un medio específico antes de asistir, puedo dejarte con un asesor para validarlo.`;
  }

  return null;
}

function sanitizar(text) {
  return String(text || "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo omitido]")
    .replace(/(?:\d[\s.\-]?){7,13}/g, "[dato numérico omitido]")
    .slice(0, 1500);
}

async function consultarIA(text, session) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();

  if (!apiKey) {
    console.warn(
      "⚠️ GROQ_API_KEY no está configurada. Se usará respuesta local segura."
    );
    return null;
  }

  const prompt = `Eres el asistente de VIP CRC Galerías en Bogotá. Responde SOLO preguntas sobre CRC y licencias de conducción. Sé breve, claro, amable y comercial.

INFORMACIÓN AUTORIZADA:
- Dirección: Cra. 28A #51-70, barrio Galerías, Bogotá. Hay parqueadero.
- Renovación o refrendación de una categoría A1, A2, B1, B2, C1, C2 o C3: $180.000.
- Combo de dos categorías: $250.000.
- Duración aproximada del examen CRC: 40 a 60 minutos, según flujo de atención.
- Horario: lunes a viernes 7:00 a.m. a 3:30 p.m.; sábados 7:00 a.m. a 11:30 a.m.; domingos y festivos no se labora.
- Se atiende por orden de llegada, pero si la persona agenda se respeta la hora programada.
- El CRC realiza evaluaciones y certificación de aptitud para conducción.
- El CRC NO es escuela de conducción y NO es el organismo de tránsito que expide la licencia final.
- Después de aprobar el proceso del CRC, el usuario debe continuar el trámite ante el organismo de tránsito correspondiente.
- No inventes resultados de RUNT/SIMIT, comparendos, vigencias, normas, requisitos externos, precios, promociones ni diagnósticos.
- No pidas ni repitas datos personales.
- Si no tienes información segura, indica que un asesor debe confirmarlo.
- Si preguntan algo ajeno al CRC, explica brevemente que este canal es de VIP CRC Galerías.

Paso actual del flujo: ${session.step || "NO_DEFINIDO"}.

Devuelve únicamente JSON válido con esta forma:
{"respuesta":"texto para el usuario","confianza":"alta|media|baja"}`;

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: sanitizar(text) },
        ],
        temperature: 0.2,
        max_completion_tokens: 350,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      const detalle = await response.text().catch(() => "");
      throw new Error(`Groq ${response.status}: ${detalle.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : null;
    const respuesta = String(parsed?.respuesta || "").trim();

    if (!respuesta) throw new Error("Groq respondió sin campo respuesta");

    console.log(
      `🤖 IA Groq respondió correctamente usando ${process.env.GROQ_MODEL || "llama-3.3-70b-versatile"}`
    );

    return respuesta;
  } catch (error) {
    console.error("⚠️ Fallback IA no disponible:", error.message);
    return null;
  }
}

async function responderFallback(to, text) {
  if (String(to).startsWith("whatsapp:")) {
    await sendTwilioText(to, text);
  } else {
    await sendText(to, text);
  }

  Stats.mensajeEnviado(to, String(text).slice(0, 120));
  await logOutgoingMessage(to, text);
}

router.use(async (req, res, next) => {
  try {
    if (req.method !== "POST") return next();

    const incoming = extraerIncoming(req);
    if (!incoming) return next();

    const session = getSession(incoming.from);

    // El primer mensaje siempre debe iniciar el flujo comercial definido.
    // Tampoco interferimos cuando ya está atendiendo un asesor.
    if (
      ["MENU_INICIAL", "HUMANO", "ENVIANDO_CORREO_CITA"].includes(
        session.step
      )
    ) {
      return next();
    }

    if (
      esEntradaPropiaDelPaso(session.step, incoming.text) ||
      !pareceConsulta(incoming.text)
    ) {
      return next();
    }

    // Evitar que el mismo mensaje, recibido por Meta y Chatwoot, consulte la IA dos veces.
    if (esDuplicado(incoming)) {
      if (!res.headersSent) res.status(200).send("OK");
      return;
    }

    let respuesta = respuestaLocalSegura(incoming.text);

    // Las respuestas fijas seguras tienen prioridad; la IA entra cuando la
    // pregunta no está cubierta por el conocimiento local del bot.
    if (!respuesta) {
      respuesta = await consultarIA(incoming.text, session);
    }

    // Si Groq falla o no está configurado, no volvemos a imprimir el menú
    // completo. Damos una salida segura y mantenemos el punto del flujo.
    if (!respuesta) {
      respuesta =
        "Puedo ayudarte con información del CRC y licencias de conducción, pero para esa consulta específica prefiero no darte un dato incorrecto. Si deseas, escribe *asesor* para que una persona la confirme.";
    }

    if (!res.headersSent) res.status(200).send("OK");

    Stats.mensajeRecibido(incoming.from);

    if (!incoming.skipIncomingNote) {
      await logIncomingMessage(incoming.from, incoming.text).catch(() => null);
    }

    await responderFallback(
      incoming.from,
      `${respuesta}${continuacion(session)}`
    );
  } catch (error) {
    console.error("⚠️ Error en middleware de IA:", error.message);
    return next();
  }
});

module.exports = router;
