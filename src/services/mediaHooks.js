"use strict";

const whatsappService = require("./whatsapp");
const twilioService = require("./twilio");
const { sendFacadeViaContent } = require("./twilioFacade");
const {
  ONAC_CERT_URL,
  captionAcreditacion,
  limpiarMensajeHabilitacionAntiguo,
} = require("./crcMedia");

let instalado = false;

function esConfirmacionFinal(texto) {
  return String(texto || "").includes("Cita preconfirmada - VIP CRC Galerías");
}

function esPromocionRenovacion(texto) {
  const text = String(texto || "");
  return (
    text.includes("Renovación o refrendación: $180.000") &&
    text.includes("¿Deseas agendar tu cita?")
  );
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

async function enviarFachadaTwilio(to, textoOriginal) {
  if (!esPromocionRenovacion(textoOriginal)) return;

  try {
    // Los Quick Replies ya demostraron que Twilio Content API está llegando
    // correctamente a este sender. Usamos esa misma ruta para la fotografía,
    // con un content type twilio/media y el JPG versionado en el repositorio.
    await sendFacadeViaContent(to);
  } catch (error) {
    // twilioFacade ya hace un intento de respaldo con MediaUrl. Si ambos
    // fallan, dejamos el error explícito pero NO interrumpimos el agendamiento.
    console.error("❌ No fue posible entregar la foto de la sede:", error.message);
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

    // CRC trabaja por Twilio. originalTwilio detecta menús y usa Twilio
    // Content API para Quick Reply/List Picker. Después de la promoción se
    // fuerza además el envío de la fachada por twilio/media, que es el mismo
    // canal rico que ya está funcionando para los botones.
    const result = await originalTwilio(to, limpio);
    await enviarFachadaTwilio(to, original);
    await enviarExtrasTwilio(to, original);
    return result;
  };
}

module.exports = { instalarMediaHooks };
