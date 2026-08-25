"use strict";

const express = require("express");
const router = express.Router();
const { rememberConversation } = require("../services/chatwoot");

function normalizarFrom(phone) {
  const value = String(phone || "").trim();
  if (!value) return null;
  if (value.startsWith("whatsapp:")) return value;
  return `whatsapp:${value.startsWith("+") ? value : `+${value}`}`;
}

router.use(async (req, _res, next) => {
  try {
    if (req.method !== "POST" || req.path !== "/chatwoot") return next();

    const payload = req.body || {};
    const conversationId =
      payload.conversation?.id ||
      payload.message?.conversation_id ||
      payload.conversation_id ||
      null;

    if (!conversationId) return next();

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
    if (from) {
      await rememberConversation(from, conversationId);
    }
  } catch (error) {
    console.error("⚠️ No se pudo vincular la conversación de Chatwoot:", error.message);
  }

  return next();
});

module.exports = router;
