"use strict";

const express = require("express");
const router = express.Router();
const { getChatwootNoteStatus } = require("../services/chatwoot");
const { getTwilioStatus } = require("../services/twilio");

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Bot WhatsApp CRC VIP",
    channel: "twilio_whatsapp",
    twilio: getTwilioStatus(),
    mode: "crc_atencion_agendamiento",
    externalQueries: { runt: false, simit: false },
    webhooks: { authentication: process.env.WEBHOOK_AUTH_MODE === "compat" ? "compat" : "strict" },
    ai: { configured: Boolean(process.env.GROQ_API_KEY), mode: "catalog_intent" },
    chatwootNotes: getChatwootNoteStatus(),
  });
});

module.exports = router;
