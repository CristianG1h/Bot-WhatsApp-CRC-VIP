"use strict";

const express = require("express");
const router = express.Router();
const { getChatwootNoteStatus } = require("../services/chatwoot");

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Bot WhatsApp CRC VIP",
    chatwootNotes: getChatwootNoteStatus(),
  });
});

module.exports = router;
