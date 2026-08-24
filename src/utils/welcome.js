const MENSAJE_INICIAL_CRC = `👋 *Bienvenido a VIP CRC Galerías*

Antes de continuar, te compartimos la información principal:

📍 *Dirección:* Cra. 28A #51-70, Bogotá.
🚗 *Contamos con parqueadero.*

💰 *Valor promocional del examen CRC:*
• *Una categoría:* $180.000
  Aplica para A2, B1, B2, C1, C2 o C3.
• *Dos categorías en combo:* $250.000
  Ejemplo: A2 + C1.

🗓️ *No necesitas cita previa.* Puedes asistir directamente dentro de nuestro horario de atención. Si realizas un agendamiento, respetamos la hora registrada.

📞 Puedes continuar tu atención por este mismo WhatsApp.`;

const bienvenidasEnviadas = new Set();

function normalizarTelefono(valor) {
  return String(valor || "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");
}

function debeEnviarMensajeInicial(to) {
  const key = normalizarTelefono(to);
  return Boolean(key) && !bienvenidasEnviadas.has(key);
}

function marcarMensajeInicialEnviado(to) {
  const key = normalizarTelefono(to);
  if (key) bienvenidasEnviadas.add(key);
}

module.exports = {
  MENSAJE_INICIAL_CRC,
  debeEnviarMensajeInicial,
  marcarMensajeInicialEnviado,
};
