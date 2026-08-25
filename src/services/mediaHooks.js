"use strict";

const whatsappService = require("./whatsapp");
const twilioService = require("./twilio");
const {
  ONAC_CERT_URL,
  getFachadaUrl,
  captionFotoSede,
  captionAcreditacion,
  limpiarMensajeHabilitacionAntiguo,
} = require("./crcMedia");

let instalado = false;

function esMensajePromocion(texto) {
  const t = String(texto || "");
  return (
    t.includes("Renovación o refrendación: $180.000") &&
    t.includes("¿Deseas agendar tu cita?")
  );
}

function esConfirmacionFinal(texto) {
  return String(texto || "").includes("Cita preconfirmada - VIP CRC Galerías");
}

async function enviarExtrasMeta(to, textoOriginal) {
  if (esMensajePromocion(textoOriginal)) {
    try {
      await whatsappService.sendImage(to, getFachadaUrl(), captionFotoSede());
    } catch (error) {
      console.error("⚠️ No se pudo enviar foto guía de la sede:", error.message);
      await whatsappService.sendText(
        to,
        `${captionFotoSede()}\n\n🖼️ Foto de referencia: ${getFachadaUrl()}`
      );
    }
  }

  if (esConfirmacionFinal(textoOriginal)) {
    try {
      await whatsappService.sendDocument(
        to,
        ONAC_CERT_URL,
        "Certificado_ONAC_22-CEP-076_VIP_Salud_Ocupacional.pdf",
        captionAcreditacion()
      );
    } catch (error) {
      console.error("⚠️ No se pudo enviar acreditación ONAC:", error.message);
      await whatsappService.sendText(
        to,
        `${captionAcreditacion()}\n\n📎 Certificado oficial: ${ONAC_CERT_URL}`
      );
    }
  }
}

async function enviarExtrasTwilio(to, textoOriginal) {
  if (esMensajePromocion(textoOriginal)) {
    try {
      await twilioService.sendTwilioMedia(to, captionFotoSede(), getFachadaUrl());
    } catch (error) {
      console.error("⚠️ No se pudo enviar foto guía por Twilio:", error.message);
      await twilioService.sendTwilioText(
        to,
        `${captionFotoSede()}\n\n🖼️ Foto de referencia: ${getFachadaUrl()}`
      );
    }
  }

  if (esConfirmacionFinal(textoOriginal)) {
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
    const result = await originalTwilio(to, limpio);
    await enviarExtrasTwilio(to, original);
    return result;
  };
}

module.exports = { instalarMediaHooks };