const twilio = require("twilio");
const { prepararMensajeSinConsultasExternas } = require("../utils/sessions");
const { addPrivateNote } = require("./chatwoot");
const {
  MENSAJE_INICIAL_CRC,
  debeEnviarMensajeInicial,
  marcarMensajeInicialEnviado,
} = require("../utils/welcome");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const from = process.env.TWILIO_WHATSAPP_FROM;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarTextoTwilio(to, body) {
  await client.messages.create({
    from,
    to: to.startsWith("whatsapp:") ? to : `whatsapp:+${to}`,
    body
  });
}

async function registrarRespuestaBotEnChatwoot(to, body) {
  await addPrivateNote(
    to,
    `🤖 *Respuesta del bot:*

${String(body || "").trim()}`
  );
}

async function sendTwilioText(to, body) {
  const mensaje = prepararMensajeSinConsultasExternas(to, body);

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
    console.log("⚠️ Twilio no configurado. Mensaje:", mensaje);
    return;
  }

  if (debeEnviarMensajeInicial(to)) {
    await enviarTextoTwilio(to, MENSAJE_INICIAL_CRC);
    marcarMensajeInicialEnviado(to);
    await registrarRespuestaBotEnChatwoot(to, MENSAJE_INICIAL_CRC);
    await esperar(600);
  }

  await enviarTextoTwilio(to, mensaje);
}

module.exports = { sendTwilioText };
