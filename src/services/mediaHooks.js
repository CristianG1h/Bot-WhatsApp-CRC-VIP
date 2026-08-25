"use strict";

const whatsappService = require("./whatsapp");
const twilioService = require("./twilio");
const { trySendInteractive } = require("./chatwootInteractive");
const {
  ONAC_CERT_URL,
  captionAcreditacion,
  limpiarMensajeHabilitacionAntiguo,
} = require("./crcMedia");

let instalado = false;

function esConfirmacionFinal(texto) {
  return String(texto || "").includes("Cita preconfirmada - VIP CRC Galerías");
}

async function enviarExtrasMeta(to, textoOriginal) {
  if (!esConfirmacionFinal(textoOriginal)) return;

  try {
    await whatsappService.sendDocument(
      to,
      ONAC_CERT_URL,
      "Certificado_ONAC_22-CEP-076_VIP_Salud_Ocupacional.pdf",
      captionAcreditacion()
    );
  } catch (error) {
    console.error("⚠️ No se pudo enviar acreditación ONAC:", error.message);
    await whatsappService.sendTextPlain(
      to,
      `${captionAcreditacion()}\n\n📎 Certificado oficial: ${ONAC_CERT_URL}`
    );
  }
}

async function enviarExtrasTwilio(to, textoOriginal) {
  if (!esConfirmacionFinal(textoOriginal)) return;

  try {
    await twilioService.sendTwilioMedia(to, captionAcreditacion(), ONAC_CERT_URL);
  } catch (error) {
    console.error("⚠️ No se pudo enviar acreditación ONAC por Twilio:", error.message);
    await twilioService.sendTwilioText(
      to,
      `${captionAcreditacion()}\n\n📎 Certificado oficial: ${ONAC_CERT_URL}`
    );
  }
}

async function intentarChatwootInteractivo(to, texto) {
  try {
    return await trySendInteractive(to, texto);
  } catch (error) {
    console.error(
      "⚠️ Chatwoot no pudo enviar el menú interactivo; se usa el canal de respaldo:",
      error.message
    );
    return null;
  }
}

function instalarMediaHooks() {
  if (instalado) return;
  instalado = true;

  const originalMeta = whatsappService.sendText;
  whatsappService.sendText = async (to, body) => {
    const original = String(body || "");
    const limpio = limpiarMensajeHabilitacionAntiguo(original);

    // Cuando la conversación viene de Chatwoot, usamos input_select. La
    // versión 4.x de Chatwoot convierte este tipo en botones/listas nativas
    // de WhatsApp Cloud y el toque vuelve como un mensaje del usuario.
    let result = await intentarChatwootInteractivo(to, limpio);
    if (!result) result = await originalMeta(to, limpio);

    await enviarExtrasMeta(to, original);
    return result;
  };

  const originalTwilio = twilioService.sendTwilioText;
  twilioService.sendTwilioText = async (to, body) => {
    const original = String(body || "");
    const limpio = limpiarMensajeHabilitacionAntiguo(original);

    // También se intenta Chatwoot antes de Twilio. Esto es importante porque
    // los webhooks de Chatwoot usan destinos con prefijo whatsapp:+57...
    let result = await intentarChatwootInteractivo(to, limpio);
    if (!result) result = await originalTwilio(to, limpio);

    if (!whatsappService.whatsappConfigurado()) {
      await enviarExtrasTwilio(to, original);
    }

    return result;
  };
}

module.exports = { instalarMediaHooks };
