const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).send("✅ Bot WhatsApp CRC VIP funcionando");
});

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Bot WhatsApp CRC VIP"
  });
});

module.exports = router;