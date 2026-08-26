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

function cuerpoPromocion(texto) {
  return String(texto || "")
    .replace(/\n\n1️⃣ Sí\n2️⃣ No\s*$/, "")
    .trim();
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

async function enviarPromocionConFachadaTwilio(to, texto) {
  // La promoción se maneja aquí de forma especial para evitar el intento
  // antiguo de MediaUrl que todavía existe como compatibilidad en twilio.js.
  // Así se genera UN solo mensaje de foto y luego el Quick Reply Agendar/No.
  try {
    await sendFacadeViaContent(to);
  } catch (error) {
    console.error("❌ No fue posible iniciar el envío de la fachada:", error.message);
  }

  // Pequeño margen para conservar el orden visual: foto -> promoción/botones.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const body = cuerpoPromocion(texto);

  try {
    return await twilioService.sendTwilioQuickReply(to, body, [
      { id: "1", title: "Agendar" },
      { id: "2", title: "No" },
    ]);
  } catch (error) {
    console.error(
      "⚠️ Quick Reply de promoción falló; se usa texto normal:",
      error.message
    );
    return twilioService.sendTwilioTextPlain(to, texto);
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

    let result;

    if (esPromocionRenovacion(limpio)) {
      // CRC está conectado por Twilio. Para este punto concreto no usamos el
      // detector legacy de twilio.js porque disparaba además un MediaUrl
      // duplicado. La foto se envía con la plantilla Media corregida y los
      // botones por Quick Reply, ambos directamente desde Twilio.
      result = await enviarPromocionConFachadaTwilio(to, limpio);
    } else {
      result = await originalTwilio(to, limpio);
    }

    await enviarExtrasTwilio(to, original);
    return result;
  };
}

module.exports = { instalarMediaHooks };
