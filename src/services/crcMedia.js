"use strict";

const DEFAULT_PUBLIC_URL = "https://bot-whatsapp-crc-vip.onrender.com";

const ONAC_CERT_URL = "https://onac.org.co/certificados/22-CEP-076.pdf";
const ONAC_DIRECTORY_URL =
  "https://onac.org.co/directorio3/index.php/acreditaciones/22-CEP-076";

function getPublicBaseUrl() {
  return String(process.env.PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/$/, "");
}

function getFachadaUrl() {
  return `${getPublicBaseUrl()}/media/fachada-crc-vip.jpg`;
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function esConsultaHabilitacion(texto) {
  const t = normalizarTexto(texto);
  if (!t) return false;

  if (
    /\b(habilitacion|habilitado|habilitada|habilitados|habilitadas|acreditacion|acreditado|acreditada|acreditados|acreditadas|onac)\b/.test(
      t
    )
  ) {
    return true;
  }

  if (
    /\b(certificado|documento|soporte|aval|autorizacion|resolucion)\b/.test(t) &&
    /\b(crc|centro|ustedes|vip|licencia|conductor|conductores)\b/.test(t)
  ) {
    return true;
  }

  return false;
}

function captionFotoSede() {
  return `📍 *Guía para ubicar nuestra sede*

Esta es la fachada de *VIP CRC Galerías*.

Cra. 28A #51-70, barrio Galerías – Bogotá.
🚗 Contamos con parqueadero.`;
}

function captionAcreditacion() {
  return `📄 *Acreditación oficial del CRC*

Para que puedas validar el respaldo de nuestro centro, te compartimos el certificado de acreditación ONAC *22-CEP-076* de *VIP SALUD OCUPACIONAL SAS*, renovada en 2026.

🔎 También puedes verificarla directamente en el Directorio Oficial de Acreditados de ONAC:
${ONAC_DIRECTORY_URL}`;
}

function limpiarMensajeHabilitacionAntiguo(texto) {
  return String(texto || "")
    .replace(
      /\n\n📄 Si necesitas validar la habilitación del centro, un asesor puede compartirte los documentos correspondientes\./g,
      ""
    )
    .trim();
}

module.exports = {
  ONAC_CERT_URL,
  ONAC_DIRECTORY_URL,
  getFachadaUrl,
  esConsultaHabilitacion,
  captionFotoSede,
  captionAcreditacion,
  limpiarMensajeHabilitacionAntiguo,
};