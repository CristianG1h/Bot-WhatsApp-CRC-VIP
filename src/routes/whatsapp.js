const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config");

async function sendText(to, body) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("⚠️ WhatsApp no configurado. Mensaje:", body);
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

module.exports = { sendText };