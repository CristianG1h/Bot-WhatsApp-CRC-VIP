"use strict";

const express = require("express");
const router = express.Router();

router.use((req, res, next) => {
  if (req.method !== "POST" || req.path !== "/chatwoot") return next();

  const payload = req.body || {};
  const messageType = payload.message_type || payload.message?.message_type;
  if (messageType !== "outgoing") return next();

  const attrs = payload.content_attributes || payload.message?.content_attributes || {};
  const content = String(payload.content || payload.message?.content || "");

  const esAdjuntoBot =
    attrs.bot_crc_media === true ||
    attrs.bot_crc_media === "true" ||
    content.includes("Guía para ubicar nuestra sede") ||
    content.includes("Acreditación oficial del CRC");

  if (!esAdjuntoBot) return next();

  console.log("🤖 Adjunto del bot detectado en webhook Chatwoot; no se pausa el flujo");
  return res.status(200).send("OK");
});

module.exports = router;
