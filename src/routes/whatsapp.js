"use strict";

const express = require("express");
const router = express.Router();
const coreRouter = require("./whatsapp-core");

const Stats = require("../services/stats");
const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");
const { logIncomingMessage, logOutgoingMessage } = require("../services/chatwoot");
const { limpiarTexto } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const { detectarPreguntasRapidas } = require("../utils/messages");
const {
  getSession,
  updateSession,
  setReplyTarget,
} = require("../utils/sessions");
const {
  detectarOpcionDia,
  esFechaPasada,
  fechaKey,
  formatearFechaColombia,
  menuDiasDisponibles,
  menuHorariosCita,
  motivoNoLaboral,
  obtenerSiguienteDiaDisponible,
  obtenerSlotsDisponibles,
  parsearFechaUsuario,
  sumarDias,
} = require("../utils/agenda");

// Este archivo funciona como una capa pequeña delante del flujo histórico.
// Solo toma el control de la selección de fecha. Todo lo demás continúa en
// whatsapp-core.js sin cambiar la lógica del bot, Chatwoot, citas o asesor.

const mensajesProcesados = new Map();

function normalizarTelefono(valor) {
  return String(valor || "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");
}

function claveContenido(from, text) {
  return `contenido:${normalizarTelefono(from)}::${String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

function esDuplicado(from, text, { source = "unknown", messageId = null } = {}) {
  const now = Date.now();
  const id = messageId ? String(messageId) : null;

  if (id) {
    const keyId = `id:${id}`;
    const anterior = mensajesProcesados.get(keyId);
    if (anterior && now - anterior.time < 60000) return true;
    mensajesProcesados.set(keyId, { time: now, source, messageId: id });
  }

  const key = claveContenido(from, text);
  const anterior = mensajesProcesados.get(key);

  if (anterior && now - anterior.time < 4000) {
    const diferenteFuente = anterior.source !== source;
    const faltaIdentificador = !id || !anterior.messageId;
    if (diferenteFuente || faltaIdentificador) return true;
  }

  mensajesProcesados.set(key, { time: now, source, messageId: id });

  for (const [keyGuardada, data] of mensajesProcesados.entries()) {
    if (now - Number(data?.time || 0) > 120000) {
      mensajesProcesados.delete(keyGuardada);
    }
  }

  return false;
}

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
  const path = req.path || "/";

  if (path === "/twilio") {
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

  if (path === "/chatwoot") {
    const payload = req.body || {};
    const event = payload.event;
    const messageType = payload.message_type || payload.message?.message_type;
    const isPrivate = payload.private === true || payload.message?.private === true;

    if (isPrivate) return null;
    if (event && event !== "message_created") return null;
    if (messageType !== "incoming") return null;

    const content = payload.content || payload.message?.content || "";
    if (!String(content).trim()) return null;

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
    const contact = payload.conversation?.contact || payload.contact || sender || {};

    const phone =
      sender.phone_number ||
      contact.phone_number ||
      payload.conversation?.meta?.sender?.phone_number ||
      payload.conversation?.contact_inbox?.source_id ||
      payload.contact_inbox?.source_id ||
      "";

    if (!phone) return null;

    const from = phone.startsWith("whatsapp:")
      ? phone
      : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`;

    return {
      from,
      text: limpiarTexto(content),
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

  if (path === "/") {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
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

async function responderAgenda(to, body) {
  const texto = String(body || "").trim();
  if (!texto) return;

  if (String(to).startsWith("whatsapp:")) {
    await sendTwilioText(to, texto);
  } else {
    await sendText(to, texto);
  }

  Stats.mensajeEnviado(to, texto.slice(0, 120));
  await logOutgoingMessage(to, texto);
}

function mensajePedirOtroDia() {
  return `Perfecto ✅

Escríbeme la fecha en la que deseas asistir.

Puedes enviarla, por ejemplo, así:
• *viernes*
• *15 de septiembre*
• *15/09/2026*

El sistema verificará automáticamente que no sea domingo ni festivo.`;
}

function debePasarAlFlujoNormal(text) {
  const msg = String(text || "").toLowerCase().trim();

  if (
    ["menu", "menú", "inicio", "volver", "asesor"].includes(msg) ||
    msg.includes("hablar con asesor")
  ) {
    return true;
  }

  return detectarPreguntasRapidas(text).length > 0;
}

async function guardarFechaYMostrarHorarios(from, fecha) {
  let fechaSeleccionada = fecha;
  let slots = obtenerSlotsDisponibles(fechaSeleccionada);

  // Puede ocurrir que el usuario haya dejado el menú abierto y responda
  // después de que terminó la jornada del día seleccionado.
  if (!slots.length) {
    const siguiente = obtenerSiguienteDiaDisponible(sumarDias(fechaSeleccionada, 1));

    if (!siguiente) {
      await responderAgenda(
        from,
        "En este momento no pude encontrar un próximo día disponible. Escribe *asesor* para ayudarte manualmente."
      );
      return true;
    }

    fechaSeleccionada = siguiente;
    slots = obtenerSlotsDisponibles(fechaSeleccionada);

    await responderAgenda(
      from,
      `El horario del día que elegiste ya finalizó. El siguiente día disponible es:\n\n📅 *${formatearFechaColombia(fechaSeleccionada)}*`
    );
  }

  updateSession(from, {
    diaCita: formatearFechaColombia(fechaSeleccionada),
    fechaCitaISO: fechaKey(fechaSeleccionada),
    fechaSugeridaISO: null,
    step: "HORARIO_CITA",
  });

  const menu = menuHorariosCita(fechaSeleccionada);
  if (menu) await responderAgenda(from, menu);
  return true;
}

async function manejarDiaCita(from, text) {
  const seleccion = detectarOpcionDia(text);
  if (!seleccion) return false;

  if (seleccion.tipo === "otro") {
    updateSession(from, {
      diaCita: "Otro día",
      fechaCitaISO: null,
      fechaSugeridaISO: null,
      step: "DIA_PERSONALIZADO",
    });

    await responderAgenda(from, mensajePedirOtroDia());
    return true;
  }

  return guardarFechaYMostrarHorarios(from, seleccion.fecha);
}

function fechaDesdeISO(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

async function manejarDiaPersonalizado(from, text, session) {
  if (debePasarAlFlujoNormal(text)) return false;

  const msg = String(text || "").trim().toLowerCase();
  let fecha = null;

  if (msg === "1" && session.fechaSugeridaISO) {
    fecha = fechaDesdeISO(session.fechaSugeridaISO);
  } else {
    fecha = parsearFechaUsuario(text);
  }

  if (!fecha) {
    await responderAgenda(
      from,
      `No pude identificar una fecha exacta.\n\n${mensajePedirOtroDia()}`
    );
    return true;
  }

  if (esFechaPasada(fecha)) {
    await responderAgenda(
      from,
      `La fecha *${formatearFechaColombia(fecha)}* ya pasó.\n\nPor favor envíame una fecha futura.`
    );
    return true;
  }

  const motivo = motivoNoLaboral(fecha);

  if (motivo) {
    const siguiente = obtenerSiguienteDiaDisponible(sumarDias(fecha, 1));

    if (!siguiente) {
      await responderAgenda(
        from,
        `El día *${formatearFechaColombia(fecha)}* no tenemos atención porque es ${motivo}.\n\nEscríbeme otra fecha disponible.`
      );
      return true;
    }

    updateSession(from, {
      fechaSugeridaISO: fechaKey(siguiente),
    });

    await responderAgenda(
      from,
      `Ese día no tenemos atención porque es *${motivo}*.\n\nEl siguiente día disponible es:\n📅 *${formatearFechaColombia(siguiente)}*\n\n1️⃣ Sí, usar ese día\n\nO escríbeme otra fecha.`
    );
    return true;
  }

  if (!obtenerSlotsDisponibles(fecha).length) {
    const siguiente = obtenerSiguienteDiaDisponible(sumarDias(fecha, 1));

    if (siguiente) {
      updateSession(from, {
        fechaSugeridaISO: fechaKey(siguiente),
      });

      await responderAgenda(
        from,
        `Para *${formatearFechaColombia(fecha)}* ya terminó nuestro horario de atención.\n\nEl siguiente día disponible es:\n📅 *${formatearFechaColombia(siguiente)}*\n\n1️⃣ Sí, usar ese día\n\nO escríbeme otra fecha.`
      );
      return true;
    }
  }

  return guardarFechaYMostrarHorarios(from, fecha);
}

router.use(async (req, res, next) => {
  try {
    if (req.method !== "POST") return next();

    const incoming = extraerIncoming(req);
    if (!incoming) return next();

    const { from, text, source, messageId, skipIncomingNote } = incoming;

    if (esDuplicado(from, text, { source, messageId })) {
      console.log("⏭️ Mensaje duplicado ignorado por capa de agenda:", {
        from,
        text,
        source,
        messageId,
      });

      if (!res.headersSent) res.status(200).send("OK");
      return;
    }

    const session = getSession(from);
    const esPasoFecha = ["DIA_CITA", "DIA_PERSONALIZADO"].includes(session.step);

    if (!esPasoFecha) return next();

    // En DIA_CITA solo interceptamos una selección válida. Preguntas libres,
    // palabras como asesor/menu y otros mensajes siguen al flujo histórico.
    if (session.step === "DIA_CITA" && !detectarOpcionDia(text)) {
      return next();
    }

    if (
      session.step === "DIA_PERSONALIZADO" &&
      debePasarAlFlujoNormal(text)
    ) {
      return next();
    }

    if (!res.headersSent) res.status(200).send("OK");

    Stats.mensajeRecibido(from);
    setReplyTarget(from, from);

    if (!skipIncomingNote) {
      await logIncomingMessage(from, text).catch((error) => {
        console.error("⚠️ No se pudo registrar incoming de agenda en Chatwoot:", error.message);
      });
    }

    if (isRateLimited(from, session.step)) {
      Stats.rateLimitado(from);
      await responderAgenda(
        from,
        "⚠️ Has enviado muchos mensajes seguidos.\nPor favor espera un momento."
      );
      return;
    }

    let manejado = false;

    if (session.step === "DIA_CITA") {
      manejado = await manejarDiaCita(from, text);
    } else if (session.step === "DIA_PERSONALIZADO") {
      manejado = await manejarDiaPersonalizado(from, text, session);
    }

    if (!manejado) {
      // Normalmente no se alcanza porque los casos no manejados se delegan
      // antes de responder 200. Se deja como respaldo para no perder el flujo.
      await responderAgenda(from, menuDiasDisponibles());
    }
  } catch (error) {
    console.error("❌ Error en capa de calendario CRC:", error.message);

    if (!res.headersSent) {
      return next();
    }
  }
});

router.use(coreRouter);

module.exports = router;
