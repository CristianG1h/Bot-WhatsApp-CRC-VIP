"use strict";

const express = require("express");
const router = express.Router();
const { rememberConversation } = require("../services/chatwoot");
const {
  rememberInteractiveConversation,
} = require("../services/chatwootInteractive");

function normalizarFrom(phone) {
  const value = String(phone || "").trim();
  if (!value) return null;
  if (value.startsWith("whatsapp:")) return value;
  return `whatsapp:${value.startsWith("+") ? value : `+${value}`}`;
}

router.use(async (req, res, next) => {
  try {
    if (req.method !== "POST" || req.path !== "/chatwoot") return next();

    const payload = req.body || {};
    const conversationId =
      payload.conversation?.id ||
      payload.message?.conversation_id ||
      payload.conversation_id ||
      null;

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

    const from = normalizarFrom(phone);

    if (conversationId && from) {
      await rememberConversation(from, conversationId);
      rememberInteractiveConversation(from, conversationId);
    }

    // Los menús input_select creados por el propio bot regresan como mensajes
    // outgoing en el webhook. No deben interpretarse como una respuesta humana
    // del asesor ni pausar el bot.
    const messageType = payload.message_type || payload.message?.message_type;
    const attrs =
      payload.content_attributes || payload.message?.content_attributes || {};
    const esInteractivoBot =
      attrs.bot_crc_interactive === true ||
      attrs.bot_crc_interactive === "true";

    if (messageType === "outgoing" && esInteractivoBot) {
      console.log("🤖 Menú interactivo del bot detectado; el flujo continúa activo");
      return res.status(200).send("OK");
    }
  } catch (error) {
    console.error("⚠️ No se pudo vincular la conversación de Chatwoot:", error.message);
  }

  return next();
});

module.exports = router;
