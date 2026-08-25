"use strict";

const express = require("express");
const router = express.Router();

const Stats = require("../services/stats");
const { sendText, sendDocument } = require("../services/whatsapp");
const { sendTwilioText, sendTwilioMedia } = require("../services/twilio");
const { logIncomingMessage, logOutgoingMessage } = require("../services/chatwoot");
const { getSession } = require("../utils/sessions");
const { limpiarTexto } = require("../utils/validation");
const {
  ONAC_CERT_URL,
  esConsultaHabilitacion,
  captionAcreditacion,
} = require("../services/crcMedia");

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

function esDuplicado(incoming) {
  const now = Date.now();
  const messageId = incoming.messageId ? String(incoming.messageId) : null;

  if (messageId) {
    const idKey = `id:${messageId}`;
    const previo = procesados.get(idKey);
    if (previo && now - previo.time < 60000) return true;
    procesados.set(idKey, { time: now, source: incoming.source, messageId });
  }

  const contentKey = `content:${normalizarTelefono(incoming.from)}::${String(
    incoming.text || ""
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
  const previo = procesados.get(contentKey);

  if (previo && now - previo.time < 5000) {
    const diferenteFuente = previo.source !== incoming.source;
    const faltaId = !messageId || !previo.messageId;
    if (diferenteFuente || faltaId) return true;
  }

  procesados.set(contentKey, {
    time: now,
    source: incoming.source,
    messageId,
  });

  for (const [key, data] of procesados.entries()) {
    if (now - Number(data?.time || 0) > 120000) procesados.delete(key);
  }

  return false;
}

async function enviarAcreditacion(to) {
  const caption = captionAcreditacion();

  try {
    if (String(to).startsWith("whatsapp:")) {
      await sendTwilioMedia(to, caption, ONAC_CERT_URL);
    } else {
      await sendDocument(
        to,
        ONAC_CERT_URL,
        "Certificado_ONAC_22-CEP-076_VIP_Salud_Ocupacional.pdf",
        caption
      );
    }
  } catch (error) {
    console.error("⚠️ Error enviando acreditación; se enviará enlace:", error.message);
    const fallback = `${caption}\n\n📎 Certificado: ${ONAC_CERT_URL}`;
    if (String(to).startsWith("whatsapp:")) await sendTwilioText(to, fallback);
    else await sendText(to, fallback);
  }

  Stats.mensajeEnviado(to, "Acreditación ONAC 22-CEP-076");
  await logOutgoingMessage(
    to,
    `${caption}\n\n📄 *Adjunto enviado:* Certificado ONAC 22-CEP-076.`
  );
}

router.use(async (req, res, next) => {
  try {
    if (req.method !== "POST") return next();
    const incoming = extraerIncoming(req);
    if (!incoming) return next();

    const session = getSession(incoming.from);

    // Si un asesor ya tomó la conversación, no interrumpimos su atención.
    // En cualquier otro estado —incluso antes de iniciar o después de una cita—
    // una consulta sobre habilitación/acreditación recibe el soporte oficial.
    if (session.step === "HUMANO") return next();
    if (!esConsultaHabilitacion(incoming.text)) return next();

    if (esDuplicado(incoming)) {
      if (!res.headersSent) res.status(200).send("OK");
      return;
    }

    if (!res.headersSent) res.status(200).send("OK");
    Stats.mensajeRecibido(incoming.from);

    if (!incoming.skipIncomingNote) {
      await logIncomingMessage(incoming.from, incoming.text).catch(() => null);
    }

    await enviarAcreditacion(incoming.from);
  } catch (error) {
    console.error("⚠️ Error en middleware de habilitación:", error.message);
    return next();
  }
});

module.exports = router;
