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

    let result = null;

    // PRIORIDAD 1: WhatsApp Cloud API directa. Esta ruta sí conserva los
    // botones reply/list y el encabezado con imagen. Las credenciales pueden
    // venir de Render o recuperarse al iniciar desde el inbox de Chatwoot.
    if (whatsappService.whatsappConfigurado()) {
      result = await originalMeta(to, limpio);
    } else {
      // PRIORIDAD 2: input_select de Chatwoot. Se mantiene únicamente como
      // respaldo para instalaciones donde no podamos obtener el token Meta.
      result = await intentarChatwootInteractivo(to, limpio);
      if (!result) result = await originalMeta(to, limpio);
    }

    await enviarExtrasMeta(to, original);
    return result;
  };

  const originalTwilio = twilioService.sendTwilioText;
  twilioService.sendTwilioText = async (to, body) => {
    const original = String(body || "");
    const limpio = limpiarMensajeHabilitacionAntiguo(original);

    let result = null;

    if (whatsappService.whatsappConfigurado()) {
      // originalTwilio delega a whatsappService.sendText cuando Meta está
      // disponible, por lo que termina usando los botones nativos directos.
      result = await originalTwilio(to, limpio);
    } else {
      result = await intentarChatwootInteractivo(to, limpio);
      if (!result) result = await originalTwilio(to, limpio);
    }

    if (!whatsappService.whatsappConfigurado()) {
      await enviarExtrasTwilio(to, original);
    }

    return result;
  };
}

module.exports = { instalarMediaHooks };
