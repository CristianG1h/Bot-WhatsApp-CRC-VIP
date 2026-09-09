"use strict";
const { ONAC_CERT_URL, ONAC_DIRECTORY_URL } = require("./crcMedia");
function price(name, fallback) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? "$" + value.toLocaleString("es-CO") : "por confirmar con un asesor";
}
const business = Object.freeze({
  name: "VIP CRC Galerías",
  address: "Cra. 28A #51-70, barrio Galerías – Bogotá",
  maps: process.env.CRC_MAPS_URL || "https://share.google/G0KaXb0OWp0MbqYOc",
  commercialPhone: "313 401 0901",
  commercialWhatsApp: "https://wa.me/573134010901",
});
function catalog() {
  return {
    ocupacional: "🏥 Para *exámenes médicos ocupacionales*, nuestro equipo comercial te ayudará con información y agendamiento.\n📞 *313 401 0901*\n💬 Escríbenos por WhatsApp: https://wa.me/573134010901\n\nEste chat atiende el examen CRC para trámites de licencia de conducción.",
    simit: "Gracias por escribirnos. Este canal es de *VIP CRC Galerías*, Centro de Reconocimiento de Conductores. Aquí te orientamos sobre el *examen CRC para renovar o tramitar tu licencia de conducción*.\n\nNo contamos con información ni consultas de *SIMIT, multas o comparendos* en este chat. Si necesitas el examen CRC, escribe *renovar* y te mostramos las fechas y horarios disponibles.",
    precios: "💰 El *examen CRC para renovación/refrendación* cuesta *" + price("CRC_PRECIO_UNA_CATEGORIA", 180000) +
      "* para una categoría y *" + price("CRC_PRECIO_DOS_CATEGORIAS", 250000) +
      "* para dos categorías.\nEstos valores corresponden al examen CRC; los derechos del organismo de tránsito y el curso de conducción se pagan aparte.",
    primera_vez: "Realizamos el *examen CRC para primera licencia*. El CRC no es una escuela de conducción ni expide la licencia final.\nUn asesor debe confirmar la tarifa y las categorías de tu caso.",
    duracion: "⏱️ El examen CRC suele tomar *40 a 60 minutos*, según el flujo de atención. La hora solicitada es aproximada y queda sujeta a confirmación del centro.",
    horarios: "🕒 Lunes a viernes: *7:00 a.m. a 3:30 p.m.*\nSábados: *7:00 a.m. a 11:30 a.m.*\nDomingos y festivos: *no laboramos*.",
    ubicacion: "📍 *" + business.name + "*\n" + business.address + "\nCómo llegar: " + business.maps + "\n🚗 Contamos con parqueadero.",
    parqueadero: "🚗 Sí, contamos con parqueadero en *VIP CRC Galerías*.",
    sin_cita: "Atendemos por *orden de llegada*, según la disponibilidad del centro. Para organizar tu atención puedes solicitar una fecha y un horario aproximado por este chat. La hora final la confirma el equipo.",
    pagos: "Para confirmar si puedes pagar con tarjeta, efectivo, Nequi u otro medio, escribe *asesor*. Así verificamos el medio disponible antes de que asistas.",
    requisitos: "Para asistir al CRC, trae tu *documento de identidad físico original*. Si usas gafas o tienes una condición que pueda afectar la evaluación, coméntalo al asesor para confirmar las indicaciones de tu caso.",
    proceso: "1. Solicitas fecha y horario.\n2. Registramos tus datos y enviamos la solicitud al centro.\n3. El centro confirma la disponibilidad.\n4. Asistes con tu documento físico original.\nEl CRC realiza la evaluación de aptitud; la expedición de la licencia corresponde al organismo de tránsito.",
    licencia_final: "El CRC realiza el *examen y la certificación de aptitud*. La licencia como documento final la expide el organismo de tránsito. El valor del examen no incluye ese trámite.",
    escuela: "Este canal corresponde al *CRC*, donde realizamos el examen de aptitud para conducir. Para el curso de conducción o su precio necesitas una escuela de conducción; un asesor puede orientarte.",
    consulta_externa: "En este chat te ayudamos con información del *examen CRC* y solicitudes de atención. No tenemos una consulta automática de RUNT para confirmar el estado o resultado de tu licencia.",
    vigencia: "La vigencia del certificado o los plazos de un trámite deben verificarse para tu caso. Escribe *asesor* y te orientamos sin darte una fecha que pueda ser incorrecta.",
    certificado_personal: "Si ya realizaste el examen y necesitas tu certificado o revisar su cargue, escribe *asesor*. El equipo debe revisar tu caso; este chat no confirma el resultado ni el cargue automático.",
    acreditacion: "📄 Puedes consultar la acreditación del centro *22-CEP-076* en el directorio oficial de ONAC:\n" +
      ONAC_DIRECTORY_URL + "\nCertificado del centro: " + ONAC_CERT_URL,
    cita_existente: "Para cambiar, cancelar o confirmar una cita ya solicitada, escribe *asesor*. El equipo revisará tu solicitud; este chat no modifica una reserva existente automáticamente.",
    identidad: "Somos *" + business.name + "*, Centro de Reconocimiento de Conductores en Bogotá. Te ayudamos con información del examen CRC y solicitudes de atención.",
  };
}
module.exports = { business, catalog };
