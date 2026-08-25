"use strict";

const express = require("express");
const router = express.Router();
const { getChatwootNoteStatus } = require("../services/chatwoot");
const { whatsappConfigurado } = require("../services/whatsapp");

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Bot WhatsApp CRC VIP",
    chatwootNotes: getChatwootNoteStatus(),
    whatsappCloud: {
      configured: whatsappConfigurado(),
      source: process.env.META_CONFIG_SOURCE || "unknown",
    },
  });
});

module.exports = router;
