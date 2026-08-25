"use strict";

const whatsappService = require("./whatsapp");
const twilioService = require("./twilio");
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
    console.error("⚠️ No se pudo enviar acreditación ONAC por Meta:", error.message);
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
    await twilioService.sendTwilioTextPlain(
      to,
      `${captionAcreditacion()}\n\n📎 Certificado oficial: ${ONAC_CERT_URL}`
    );
  }
}

function instalarMediaHooks() {
  if (instalado) return;
  instalado = true;

  const originalMeta = whatsappService.sendText;
  whatsappService.sendText = async (to, body) => {
    const original = String(body || "");
    const limpio = limpiarMensajeHabilitacionAntiguo(original);
    const result = await originalMeta(to, limpio);
    await enviarExtrasMeta(to, original);
    return result;
  };

  const originalTwilio = twilioService.sendTwilioText;
  twilioService.sendTwilioText = async (to, body) => {
    const original = String(body || "");
    const limpio = limpiarMensajeHabilitacionAntiguo(original);

    // CRC trabaja por Twilio. No pasamos por input_select de Chatwoot ni
    // intentamos convertir este número en un sender de Meta Cloud API.
    // originalTwilio detecta menús y usa Twilio Content API para Quick Reply
    // y List Picker; si no corresponde, envía texto normal por Twilio.
    const result = await originalTwilio(to, limpio);
    await enviarExtrasTwilio(to, original);
    return result;
  };
}

module.exports = { instalarMediaHooks };
