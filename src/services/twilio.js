const twilio = require("twilio");
const { prepararMensajeSinConsultasExternas } = require("../utils/sessions");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const from = process.env.TWILIO_WHATSAPP_FROM;

async function sendTwilioText(to, body) {
  const mensaje = prepararMensajeSinConsultasExternas(to, body);

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
    console.log("⚠️ Twilio no configurado. Mensaje:", mensaje);
    return;
  }

  await client.messages.create({
    from,
    to: to.startsWith("whatsapp:") ? to : `whatsapp:+${to}`,
    body: mensaje
  });
}

module.exports = { sendTwilioText };
