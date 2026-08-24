"use strict";

const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config");

async function sendText(to, body) {
  const mensaje = String(body || "").trim();
  if (!mensaje) return null;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("⚠️ WhatsApp no configurado. Mensaje:", mensaje);
    return null;
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: String(to || "").replace(/^whatsapp:/i, "").replace(/^\+/, ""),
      type: "text",
      text: { body: mensaje },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

module.exports = { sendText };
