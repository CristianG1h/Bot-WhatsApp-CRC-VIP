"use strict";

const express = require("express");
const router = express.Router();

const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");
const { logIncomingMessage, logOutgoingMessage } = require("../services/chatwoot");
const { getSession } = require("../utils/sessions");
const { limpiarTexto } = require("../utils/validation");
const { menuDiasDisponibles, menuHorariosCita } = require("../utils/agenda");

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
    if (isPrivate || (event && event !== "message_created") || messageType !== "incoming") {
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

    if (expectedInboxId && (!payloadInboxId || Number(payloadInboxId) !== expectedInboxId)) {
      return null;
    }

    const sender = payload.sender || payload.message?.sender || payload.conversation?.contact || payload.contact || {};
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
      messageId: payload.id || payload.message?.id || payload.message_id || null,
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
  return String(valor || "").replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

function esDuplicado({ from, text, source, messageId }) {
  const now = Date.now();
  const key = `${normalizarTelefono(from)}::${String(text).trim().toLowerCase().replace(/\s+/g, " ")}`;
  const anterior = procesados.get(key);
  if (anterior && now - anterior.time < 5000 && (anterior.source !== source || !messageId)) return true;
  procesados.set(key, { time: now, source, messageId });
  for (const [k, value] of procesados.entries()) {
    if (now - value.time > 120000) procesados.delete(k);
  }
  return false;
}

function pareceConsulta(text) {
  const t = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("?")) return true;
  return /\b(que|como|cuanto|cuanto cuesta|cual|donde|puedo|sirve|vale|precio|costo|horario|pago|pagar|tarjeta|efectivo|nequi|categoria|licencia|examen|requisito|documento|parqueadero|direccion|ubicacion|demora|duracion|medico|vision|audicion|psicologia|renovacion|refrendacion|runt|simit|comparendo|multa)\b/.test(t);
}

function esEntradaPropiaDelPaso(step, text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^[1-7]$/.test(t)) return true;
  if (["si", "sí", "no", "ok", "okay", "dale", "claro", "menu", "menú", "inicio", "volver", "reiniciar"].includes(t)) return true;
  if (step === "DIA_PERSONALIZADO" && (/\d{1,2}[\/-]\d{1,2}/.test(t) || /\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/.test(t))) return true;
  if (step === "HORARIO_PERSONALIZADO" && (/\d/.test(t) || /\b(manana|mañana|tarde)\b/.test(t))) return true;
  if (step === "NOMBRE_CITA" && t.includes(" ") && !pareceConsulta(t)) return true;
  if (["CEDULA_CITA", "TELEFONO_CITA"].includes(step) && /\d{5,}/.test(t.replace(/\D/g, ""))) return true;
  if (step === "CORREO_CITA" && t.includes("@")) return true;
  return false;
}

function fechaDesdeISO(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

function continuacion(session) {
  switch (session.step) {
    case "RENOVACION_INTERES":
      return "\n\nPara continuar:\n1️⃣ Sí, deseo renovar\n2️⃣ No";
    case "AGENDAR_RENOVACION":
    case "AGENDAR_PRIMERA_VEZ":
      return "\n\n¿Deseas agendar tu atención?\n1️⃣ Sí\n2️⃣ No";
    case "NO_RENOVACION":
      return "\n\n1️⃣ Sacar la licencia por primera vez\n2️⃣ Información del proceso\n3️⃣ Hablar con asesor";
    case "MENU_INFORMACION":
      return "\n\nPuedes seguir consultando:\n1️⃣ Precios\n2️⃣ Duración\n3️⃣ Horarios\n4️⃣ Medios de pago\n5️⃣ Proceso\n6️⃣ Ubicación\n7️⃣ Volver al inicio";
    case "DIA_CITA":
      return `\n\n${menuDiasDisponibles()}`;
    case "DIA_PERSONALIZADO":
      return "\n\nPara continuar con la cita, escríbeme la fecha que deseas.";
    case "HORARIO_CITA": {
      const fecha = fechaDesdeISO(session.fechaCitaISO);
      return fecha ? `\n\n${menuHorariosCita(fecha)}` : "\n\nPara continuar, selecciona un horario.";
    }
    case "HORARIO_PERSONALIZADO":
      return "\n\nPara continuar, indícame el horario aproximado que prefieres.";
    case "NOMBRE_CITA":
      return "\n\nPara continuar con el agendamiento, envíame tu nombre completo.";
    case "CEDULA_CITA":
      return "\n\nPara continuar, envíame tu número de cédula.";
    case "TELEFONO_CITA":
      return "\n\nPara continuar, envíame tu número de celular.";
    case "CORREO_CITA":
      return "\n\nPara continuar, envíame tu correo electrónico.";
    case "CONFIRMAR_CITA":
      return "\n\n1️⃣ Confirmar cita\n2️⃣ Corregir datos";
    default:
      return "";
  }
}

function sanitizar(text) {
  return String(text || "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo omitido]")
    .replace(/(?:\d[\s.\-]?){7,13}/g, "[dato numérico omitido]")
    .slice(0, 1500);
}

async function consultarIA(text, session) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) return null;

  const prompt = `Eres el asistente de VIP CRC Galerías en Bogotá. Responde SOLO preguntas sobre CRC y licencias de conducción. Sé breve, claro, amable y comercial.\n\nINFORMACIÓN AUTORIZADA:\n- Dirección: Cra. 28A #51-70, barrio Galerías, Bogotá. Hay parqueadero.\n- Renovación o refrendación de una categoría A1, A2, B1, B2, C1, C2 o C3: $180.000.\n- Combo de dos categorías: $250.000.\n- Duración aproximada del examen CRC: 40 a 60 minutos, según flujo de atención.\n- Horario: lunes a viernes 7:00 a.m. a 3:30 p.m.; sábados 7:00 a.m. a 11:30 a.m.; domingos y festivos no se labora.\n- Se atiende por orden de llegada, pero si la persona agenda se respeta la hora programada.\n- El CRC realiza evaluaciones para aptitud de conducción; no es escuela de conducción ni organismo de tránsito.\n- No inventes resultados RUNT/SIMIT, comparendos, vigencias, normas, requisitos externos, precios, promociones ni diagnósticos.\n- No pidas ni repitas datos personales.\n- Si no tienes información segura, indica que un asesor debe confirmarlo.\n- Si preguntan algo ajeno al CRC, explica brevemente que este canal es de VIP CRC Galerías.\n\nPaso actual del flujo: ${session.step || "NO_DEFINIDO"}.\nDevuelve únicamente JSON válido: {"respuesta":"...","confianza":"alta|media|baja"}`;

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

    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : null;
    return String(parsed?.respuesta || "").trim() || null;
  } catch (error) {
    console.error("⚠️ Fallback IA no disponible:", error.message);
    return null;
  }
}

async function responderIA(to, text) {
  if (String(to).startsWith("whatsapp:")) await sendTwilioText(to, text);
  else await sendText(to, text);
  await logOutgoingMessage(to, text);
}

router.use(async (req, res, next) => {
  try {
    if (req.method !== "POST") return next();
    const incoming = extraerIncoming(req);
    if (!incoming) return next();

    const session = getSession(incoming.from);
    if (["MENU_INICIAL", "HUMANO", "ENVIANDO_CORREO_CITA"].includes(session.step)) return next();
    if (esEntradaPropiaDelPaso(session.step, incoming.text) || !pareceConsulta(incoming.text)) return next();

    const respuesta = await consultarIA(incoming.text, session);
    if (!respuesta) return next();

    if (esDuplicado(incoming)) {
      if (!res.headersSent) res.status(200).send("OK");
      return;
    }

    if (!res.headersSent) res.status(200).send("OK");
    if (!incoming.skipIncomingNote) {
      await logIncomingMessage(incoming.from, incoming.text).catch(() => null);
    }

    await responderIA(incoming.from, `${respuesta}${continuacion(session)}`);
  } catch (error) {
    console.error("⚠️ Error en middleware de IA:", error.message);
    return next();
  }
});

module.exports = router;
