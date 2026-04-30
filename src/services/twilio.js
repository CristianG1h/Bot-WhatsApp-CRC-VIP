const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const from = process.env.TWILIO_WHATSAPP_FROM;

async function sendTwilioText(to, body) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
    console.log("⚠️ Twilio no configurado. Mensaje:", body);
    return;
  }

  await client.messages.create({
    from,
    to: to.startsWith("whatsapp:") ? to : `whatsapp:+${to}`,
    body
  });
}

module.exports = { sendTwilioText };
