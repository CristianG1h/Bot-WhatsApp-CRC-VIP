const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config");
const { prepararMensajeSinConsultasExternas } = require("../utils/sessions");
const { addPrivateNote } = require("./chatwoot");
const {
  MENSAJE_INICIAL_CRC,
  debeEnviarMensajeInicial,
  marcarMensajeInicialEnviado,
} = require("../utils/welcome");

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarTextoMeta(to, body) {
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

async function registrarRespuestaBotEnChatwoot(to, body) {
  await addPrivateNote(
    to,
    `🤖 *Respuesta del bot:*

${String(body || "").trim()}`
  );
}

async function sendText(to, body) {
  const mensaje = prepararMensajeSinConsultasExternas(to, body);

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("⚠️ WhatsApp no configurado. Mensaje:", mensaje);
    return;
  }

  if (debeEnviarMensajeInicial(to)) {
    await enviarTextoMeta(to, MENSAJE_INICIAL_CRC);
    marcarMensajeInicialEnviado(to);
    await registrarRespuestaBotEnChatwoot(to, MENSAJE_INICIAL_CRC);
    await esperar(600);
  }

  await enviarTextoMeta(to, mensaje);
}

module.exports = { sendText };
