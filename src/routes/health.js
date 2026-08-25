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
    chatwootNotes: getChatwootNoteStatus(),
  });
});

module.exports = router;
