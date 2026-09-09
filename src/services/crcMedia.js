"use strict";

// Usamos la URL RAW pública de GitHub para la foto de la sede.
// Es más estable para WhatsApp Cloud API/Twilio que depender de que Render
// termine de servir el archivo antes de que Meta intente descargarlo.
const FACHADA_URL =
  "https://raw.githubusercontent.com/CristianG1h/Bot-WhatsApp-CRC-VIP/main/src/assets/fachada-crc-vip.jpg";

const ONAC_CERT_URL = "https://onac.org.co/directorio3/index.php/acreditaciones/pdf/22-CEP-076";
const ONAC_DIRECTORY_URL =
  "https://onac.org.co/directorio3/index.php/acreditaciones/22-CEP-076";

function getFachadaUrl() {
  return FACHADA_URL;
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
  return /\b(onac|acreditacion|acreditado|acreditada|habilitacion|habilitado|habilitada)\b/.test(t) ||
    (/\b(aval|autorizacion|certificado)\b/.test(t) && /\b(del centro|del crc|de ustedes|de la sede)\b/.test(t));
}

function captionFotoSede() {
  return `📍 *Guía para ubicar nuestra sede*

Esta es la fachada de *VIP CRC Galerías*.

Cra. 28A #51-70, barrio Galerías – Bogotá.
🚗 Contamos con parqueadero.`;
}

function captionAcreditacion() {
  return `📄 *Acreditación oficial del CRC*

Para que puedas validar el respaldo de nuestro centro, te compartimos el certificado de acreditación ONAC *22-CEP-076* de *VIP SALUD OCUPACIONAL SAS*.

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
  FACHADA_URL,
  ONAC_CERT_URL,
  ONAC_DIRECTORY_URL,
  getFachadaUrl,
  esConsultaHabilitacion,
  captionFotoSede,
  captionAcreditacion,
  limpiarMensajeHabilitacionAntiguo,
};