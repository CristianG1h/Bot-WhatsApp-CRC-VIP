"use strict";

const express = require("express");
const path = require("path");
const router = express.Router();

const { getSession } = require("../utils/sessions");
const { sendAttachment } = require("../services/chatwootMedia");
const { sendImage, sendText } = require("../services/whatsapp");
const { sendTwilioMedia, sendTwilioText } = require("../services/twilio");
const { logOutgoingMessage } = require("../services/chatwoot");
const { getFachadaUrl, captionFotoSede } = require("../services/crcMedia");

const FACHADA_LOCAL = path.join(__dirname, "..", "assets", "fachada-crc-vip.jpg");
const programados = new Map();

function limpiarTexto(value) {
  return String(value || "").trim();
}

function esSi(value) {
  const t = limpiarTexto(value).toLowerCase();
  return ["1", "si", "sí", "claro", "ok", "okay", "dale", "quiero"].includes(t) ||
    t.startsWith("si ") ||
    t.startsWith("sí ");
}

function extraer(req) {
  if (req.path === "/twilio") {
    const from = req.body?.From;
    const text = req.body?.Body;
    return from && text ? { from, text, source: "twilio" } : null;
  }

  if (req.path === "/chatwoot") {
    const payload = req.body || {};
    const messageType = payload.message_type || payload.message?.message_type;
    const isPrivate = payload.private === true || payload.message?.private === true;
    if (isPrivate || messageType !== "incoming") return null;

    const sender = payload.sender || payload.message?.sender || payload.conversation?.contact || payload.contact || {};
    const contact = payload.conversation?.contact || payload.contact || sender;
    const phone =
      sender.phone_number ||
      contact.phone_number ||
      payload.conversation?.meta?.sender?.phone_number ||
      payload.conversation?.contact_inbox?.source_id ||
      payload.contact_inbox?.source_id ||
      "";
    const text = payload.content || payload.message?.content || "";
    if (!phone || !text) return null;

    return {
      from: phone.startsWith("whatsapp:")
        ? phone
        : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`,
      text,
      source: "chatwoot",
    };
  }

  if (req.path === "/") {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return null;
    const text =
      message?.text?.body ||
      message?.interactive?.button_reply?.id ||
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.id ||
      message?.interactive?.list_reply?.title ||
      "";
    return message.from && text ? { from: message.from, text, source: "meta" } : null;
  }

  return null;
}

function key(from) {
  return String(from || "").replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

async function enviarFoto(incoming) {
  const caption = captionFotoSede();
  let enviado = false;

  // Primera opción: Chatwoot sube el archivo binario directamente al canal.
  try {
    await sendAttachment(incoming.from, FACHADA_LOCAL, {
      filename: "fachada-vip-crc-galerias.jpg",
      mimeType: "image/jpeg",
      caption,
    });
    enviado = true;
  } catch (error) {
    console.error("⚠️ Foto por Chatwoot falló:", error.message);
  }

  // Respaldo por el proveedor original si Chatwoot no pudo adjuntarla.
  if (!enviado) {
    try {
      if (incoming.source === "twilio") {
        await sendTwilioMedia(incoming.from, caption, getFachadaUrl());
      } else {
        await sendImage(incoming.from, getFachadaUrl(), caption);
      }
      enviado = true;
    } catch (error) {
      console.error("⚠️ Foto por canal WhatsApp falló:", error.message);
    }
  }

  // Último respaldo visible: enlace, para que nunca desaparezca silenciosamente.
  if (!enviado) {
    const fallback = `${caption}\n\n🖼️ Foto de referencia: ${getFachadaUrl()}`;
    try {
      if (incoming.source === "twilio") await sendTwilioText(incoming.from, fallback);
      else await sendText(incoming.from, fallback);
      enviado = true;
    } catch (error) {
      console.error("❌ No fue posible entregar la guía de la sede:", error.message);
    }
  }

  if (enviado) {
    await logOutgoingMessage(
      incoming.from,
      "📷 Foto guía de la fachada de VIP CRC Galerías enviada al usuario."
    ).catch(() => null);
  }
}

router.use((req, _res, next) => {
  try {
    if (req.method !== "POST") return next();
    const incoming = extraer(req);
    if (!incoming) return next();

    const session = getSession(incoming.from);
    if (session.step !== "RENOVACION_INTERES" || !esSi(incoming.text)) return next();

    const id = key(incoming.from);
    const last = programados.get(id) || 0;
    const now = Date.now();
    if (now - last < 10000) return next();
    programados.set(id, now);

    // El flujo principal envía primero el texto de la promoción. Un pequeño
    // retraso garantiza que la foto quede inmediatamente debajo de ese mensaje.
    setTimeout(() => {
      enviarFoto(incoming).catch((error) =>
        console.error("❌ Error enviando foto programada:", error.message)
      );
    }, 900);
  } catch (error) {
    console.error("⚠️ Error preparando foto de sede:", error.message);
  }

  return next();
});

module.exports = router;
