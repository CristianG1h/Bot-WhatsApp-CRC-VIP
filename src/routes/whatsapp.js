const express = require("express");
const router = express.Router();

const { VERIFY_TOKEN } = require("../config");
const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");

const {
  consultarRuntPorCedula,
  formatearResultadoWhatsApp,
} = require("../services/runt");

const {
  consultarSimitPorDocumento,
  formatearResultadoSimitWhatsApp,
} = require("../services/simit");

const { getSession, updateSession, resetSession } = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const { getMessage } = require("../utils/messages");
const { enviarCorreoCita } = require("../services/email");
const {
  logIncomingMessage,
  logOutgoingMessage,
  markNeedsAgent,
} = require("../services/chatwoot");

async function responder(to, body) {
  const texto = String(body || "");

  if (String(to).startsWith("whatsapp:")) {
    const partes = dividirMensaje(texto, 1300);

    for (const parte of partes) {
      await sendTwilioText(to, parte);
      await esperar(700);
    }

    await logOutgoingMessage(to, texto);
    return;
  }

  const resultado = await sendText(to, texto);

  await logOutgoingMessage(to, texto);
  return resultado;
}

function dividirMensaje(texto, max = 1300) {
  if (texto.length <= max) return [texto];

  const partes = [];
  let restante = texto;

  while (restante.length > max) {
    let corte = restante.lastIndexOf("\n", max);
    if (corte < 400) corte = max;

    partes.push(restante.slice(0, corte).trim());
    restante = restante.slice(corte).trim();
  }

  if (restante.length > 0) partes.push(restante);

  return partes;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textoSeguroMensaje(message) {
  return (
    message.text?.body ||
    message.interactive?.button_reply?.id ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.id ||
    message.interactive?.list_reply?.title ||
    ""
  );
}

function tienePendientesSimit(resultadoSimit) {
  const comparendos = resultadoSimit?.comparendos || [];
  const multas = resultadoSimit?.multas || [];
  const acuerdosPago = resultadoSimit?.acuerdosPago || [];

  return comparendos.length > 0 || multas.length > 0 || acuerdosPago.length > 0;
}

/**
 * En el flujo CRC no queremos que el resultado SIMIT termine diciendo:
 * "¿Deseas que un asesor de CIA VIP revise tu caso?"
 * porque después nosotros mostramos la pregunta correcta para CRC:
 * 1. Asesor comparendos
 * 2. Seguir con RUNT
 */
function limpiarMensajeSimitParaCRC(mensaje) {
  let texto = String(mensaje || "").trim();

  const cortes = [
    "¿Deseas que un asesor de CIA VIP revise tu caso?",
    "¿Deseas que un asesor",
    "1️⃣ Sí, hablar con asesor",
    "1️⃣ Hablar con asesor",
    "2️⃣ Volver al inicio",
  ];

  for (const corte of cortes) {
    const index = texto.indexOf(corte);
    if (index !== -1) {
      texto = texto.slice(0, index).trim();
    }
  }

  return texto;
}

async function enviarRespuestaSimitCRC(from, respuestaSimit) {
  const mensajes = Array.isArray(respuestaSimit) ? respuestaSimit : [respuestaSimit];

  for (const mensaje of mensajes) {
    const limpio = limpiarMensajeSimitParaCRC(mensaje);

    if (limpio.length > 0) {
      await responder(from, limpio);
      await esperar(900);
    }
  }
}

async function consultarRuntYContinuar(from, cedula) {
  await responder(
    from,
    "🔎 Estoy consultando la información en RUNT.\nEsto puede tardar unos segundos..."
  );

  try {
    const resultado = await consultarRuntPorCedula(cedula);
    const respuesta = formatearResultadoWhatsApp(cedula, resultado);

    await responder(from, respuesta);

    /**
     * IMPORTANTE:
     * Ya no mandamos aquí otro mensaje preguntando "hoy, mañana u otro día",
     * porque el formateador de RUNT ya pregunta si desea agendar:
     *
     * 1️⃣ Sí, quiero agendar
     * 2️⃣ No por ahora
     *
     * Ahora dejamos al usuario en AGENDAR y ahí sí, si responde 1,
     * le mostramos los horarios aproximados.
     */
    updateSession(from, {
      step: "AGENDAR",
      cedula,
    });
  } catch (error) {
    console.error("❌ Error RUNT:", error.message);

    await responder(
      from,
      "⚠️ En este momento no fue posible consultar RUNT.\nPor favor intenta más tarde o escribe *asesor*."
    );
  }
}


const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * IMPORTANTE:
 * Estas fechas se manejan como "fecha/hora local de Bogotá" guardada en UTC.
 * Por eso usamos getUTCFullYear, getUTCMonth, getUTCDate, getUTCHours, etc.
 * Así evitamos que Render cambie la hora por la zona horaria del servidor.
 */
function crearFechaLocalBogota(year, month, day, hour = 12, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

function partesFechaBogota(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);

  const mapa = {};

  for (const parte of partes) {
    if (parte.type !== "literal") {
      mapa[parte.type] = parte.value;
    }
  }

  let hour = Number(mapa.hour || 0);

  if (hour === 24) {
    hour = 0;
  }

  return {
    year: Number(mapa.year),
    month: Number(mapa.month),
    day: Number(mapa.day),
    hour,
    minute: Number(mapa.minute || 0),
  };
}

function obtenerFechaBogota(offsetDias = 0) {
  const p = partesFechaBogota(new Date());
  const fecha = crearFechaLocalBogota(p.year, p.month, p.day, 12, 0);
  fecha.setUTCDate(fecha.getUTCDate() + offsetDias);
  return fecha;
}

function obtenerAhoraBogota() {
  const p = partesFechaBogota(new Date());
  return crearFechaLocalBogota(p.year, p.month, p.day, p.hour, p.minute);
}

function fechaKey(fecha) {
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const day = String(fecha.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatearFechaColombia(fecha) {
  const diaSemana = DIAS_SEMANA[fecha.getUTCDay()];
  const dia = fecha.getUTCDate();
  const mes = MESES[fecha.getUTCMonth()];
  const year = fecha.getUTCFullYear();

  return `${diaSemana}, ${dia} de ${mes} de ${year}`;
}

function sumarDias(fecha, dias) {
  const nueva = new Date(fecha);
  nueva.setUTCDate(nueva.getUTCDate() + dias);
  return nueva;
}

function siguienteLunes(fecha) {
  const nueva = new Date(fecha);
  const dia = nueva.getUTCDay();

  if (dia === 1) return nueva;

  const diasParaLunes = (8 - dia) % 7;
  nueva.setUTCDate(nueva.getUTCDate() + diasParaLunes);

  return nueva;
}

function fechaPascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return crearFechaLocalBogota(year, month, day);
}

function festivosColombia(year) {
  const pascua = fechaPascua(year);
  const festivos = [];

  function fijo(month, day) {
    festivos.push(crearFechaLocalBogota(year, month, day));
  }

  function leyEmiliani(month, day) {
    const fecha = crearFechaLocalBogota(year, month, day);
    festivos.push(siguienteLunes(fecha));
  }

  fijo(1, 1);
  leyEmiliani(1, 6);
  leyEmiliani(3, 19);

  festivos.push(sumarDias(pascua, -3)); // Jueves Santo
  festivos.push(sumarDias(pascua, -2)); // Viernes Santo
  festivos.push(siguienteLunes(sumarDias(pascua, 39))); // Ascensión
  festivos.push(siguienteLunes(sumarDias(pascua, 60))); // Corpus Christi
  festivos.push(siguienteLunes(sumarDias(pascua, 68))); // Sagrado Corazón

  fijo(5, 1);
  leyEmiliani(6, 29);
  fijo(7, 20);
  fijo(8, 7);
  leyEmiliani(8, 15);
  leyEmiliani(10, 12);
  leyEmiliani(11, 1);
  leyEmiliani(11, 11);
  fijo(12, 8);
  fijo(12, 25);

  return new Set(festivos.map(fechaKey));
}

function esFestivoColombia(fecha) {
  return festivosColombia(fecha.getUTCFullYear()).has(fechaKey(fecha));
}

function esDomingo(fecha) {
  return fecha.getUTCDay() === 0;
}

function esSabado(fecha) {
  return fecha.getUTCDay() === 6;
}

function esDiaLaboralCRC(fecha) {
  return !esDomingo(fecha) && !esFestivoColombia(fecha);
}

function obtenerSiguienteDiaLaboral(fechaInicial) {
  let fecha = new Date(fechaInicial);

  for (let i = 0; i < 15; i++) {
    if (esDiaLaboralCRC(fecha)) return fecha;
    fecha = sumarDias(fecha, 1);
  }

  return fecha;
}

function esMismaFecha(a, b) {
  return fechaKey(a) === fechaKey(b);
}

function minutosDelDia(fecha) {
  return fecha.getUTCHours() * 60 + fecha.getUTCMinutes();
}

function horaTexto(minutos) {
  const h24 = Math.floor(minutos / 60);
  const min = minutos % 60;
  const periodo = h24 >= 12 ? "p.m." : "a.m.";
  let h12 = h24 % 12;

  if (h12 === 0) h12 = 12;

  return `${h12}:${String(min).padStart(2, "0")} ${periodo}`;
}

function slotsBasePorFecha(fecha) {
  if (esSabado(fecha)) {
    return [
      { inicio: 7 * 60, fin: 9 * 60 },
      { inicio: 9 * 60, fin: 11 * 60 },
    ];
  }

  return [
    { inicio: 7 * 60, fin: 9 * 60 },
    { inicio: 9 * 60, fin: 11 * 60 },
    { inicio: 11 * 60, fin: 13 * 60 },
    { inicio: 13 * 60, fin: 15 * 60 + 30 },
  ];
}

function slotsHabitualesParaDiaPersonalizado() {
  return [
    { inicio: 7 * 60, fin: 9 * 60 },
    { inicio: 9 * 60, fin: 11 * 60 },
    { inicio: 11 * 60, fin: 13 * 60 },
    { inicio: 13 * 60, fin: 15 * 60 + 30 },
  ];
}

function obtenerSlotsDisponibles(fecha) {
  if (!esDiaLaboralCRC(fecha)) return [];

  const ahora = obtenerAhoraBogota();
  const esHoy = esMismaFecha(fecha, ahora);
  const ahoraMin = minutosDelDia(ahora);
  const margenMin = 15;

  return slotsBasePorFecha(fecha)
    .filter((slot) => {
      if (!esHoy) return true;

      return slot.fin > ahoraMin + margenMin;
    })
    .map((slot) => {
      const inicioTexto =
        esHoy && ahoraMin > slot.inicio ? "Ahora" : horaTexto(slot.inicio);

      return {
        ...slot,
        texto: `${inicioTexto} a ${horaTexto(slot.fin)}`,
      };
    });
}

function menuDiasCita() {
  const hoy = obtenerFechaBogota(0);
  const manana = obtenerFechaBogota(1);

  const hoyLaboral = esDiaLaboralCRC(hoy);
  const mananaLaboral = esDiaLaboralCRC(manana);

  const textoHoy = hoyLaboral
    ? formatearFechaColombia(hoy)
    : `${formatearFechaColombia(hoy)} - No laboramos`;

  const textoManana = mananaLaboral
    ? formatearFechaColombia(manana)
    : `${formatearFechaColombia(manana)} - No laboramos`;

  return `Excelente ✅

Para dejar tu atención preconfirmada, primero elige el día en el que deseas asistir:

1️⃣ Hoy - ${textoHoy}
2️⃣ Mañana - ${textoManana}
3️⃣ Otro día

🕒 Horario de atención:
Lunes a viernes: 7:00 a.m. a 3:30 p.m.
Sábados: 7:00 a.m. a 11:00 a.m.
Domingos y festivos: no laboramos.

Responde con el número de la opción.`;
}

function detectarDia(msg) {
  if (
    msg === "1" ||
    msg.includes("hoy") ||
    msg.includes("hoy puedo") ||
    msg.includes("voy hoy")
  ) {
    const fecha = obtenerFechaBogota(0);

    return {
      tipo: "fecha",
      fecha,
      texto: formatearFechaColombia(fecha),
    };
  }

  if (
    msg === "2" ||
    msg.includes("mañana") ||
    msg.includes("manana") ||
    msg.includes("voy mañana") ||
    msg.includes("voy manana")
  ) {
    const fecha = obtenerFechaBogota(1);

    return {
      tipo: "fecha",
      fecha,
      texto: formatearFechaColombia(fecha),
    };
  }

  if (
    msg === "3" ||
    msg.includes("otro") ||
    msg.includes("otra") ||
    msg.includes("otro dia") ||
    msg.includes("otro día") ||
    msg.includes("despues") ||
    msg.includes("después")
  ) {
    return {
      tipo: "otro",
      fecha: null,
      texto: "Otro día",
    };
  }

  return null;
}

function menuHorariosCita(fechaCita = null) {
  const fecha = fechaCita
    ? new Date(fechaCita)
    : obtenerSiguienteDiaLaboral(obtenerFechaBogota(0));

  const slots = obtenerSlotsDisponibles(fecha);

  if (slots.length === 0) {
    return `Para ese día no tenemos horarios disponibles.

Nuestro horario es:
Lunes a viernes: 7:00 a.m. a 3:30 p.m.
Sábados: 7:00 a.m. a 11:00 a.m.
Domingos y festivos: no laboramos.`;
  }

  const opciones = slots
    .map((slot, index) => `${index + 1}️⃣ ${slot.texto}`)
    .join("\n");

  return `Perfecto ✅

Día seleccionado:
📅 *${formatearFechaColombia(fecha)}*

Elige un horario aproximado de llegada:

${opciones}
${slots.length + 1}️⃣ Otro horario

Responde con el número de la opción.`;
}

function detectarHorario(msg, fechaCita = null) {
  const slots = fechaCita
    ? obtenerSlotsDisponibles(fechaCita)
    : slotsHabitualesParaDiaPersonalizado().map((slot) => ({
        ...slot,
        texto: `${horaTexto(slot.inicio)} a ${horaTexto(slot.fin)}`,
      }));

  const numero = Number(msg);

  if (Number.isInteger(numero) && numero >= 1 && numero <= slots.length) {
    return slots[numero - 1].texto;
  }

  if (Number.isInteger(numero) && numero === slots.length + 1) {
    return "Otro horario";
  }

  if (
    msg.includes("otro") ||
    msg.includes("otra") ||
    msg.includes("diferente")
  ) {
    return "Otro horario";
  }

  for (const slot of slots) {
    const inicioHora = Math.floor(slot.inicio / 60);
    const finHora = Math.floor(slot.fin / 60);

    if (msg.includes(String(inicioHora)) || msg.includes(String(finHora))) {
      return slot.texto;
    }
  }

  return null;
}

function esCorreoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || "").trim());
}

function esTelefonoValido(telefono) {
  const limpio = String(telefono || "").replace(/\D/g, "");
  return limpio.length >= 7 && limpio.length <= 13;
}

function obtenerAhoraBogotaParaAsesor() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const mapa = {};

  for (const parte of partes) {
    if (parte.type !== "literal") {
      mapa[parte.type] = parte.value;
    }
  }

  let hour = Number(mapa.hour || 0);

  if (hour === 24) {
    hour = 0;
  }

  return {
    year: Number(mapa.year),
    month: Number(mapa.month),
    day: Number(mapa.day),
    hour,
    minute: Number(mapa.minute || 0),
  };
}

function esHorarioAsesorDisponible() {
  const ahora = obtenerAhoraBogotaParaAsesor();

  const fecha = new Date(
    Date.UTC(ahora.year, ahora.month - 1, ahora.day, 12, 0, 0)
  );

  const diaSemana = fecha.getUTCDay(); 
  const minutos = ahora.hour * 60 + ahora.minute;

  const esLunesAViernes = diaSemana >= 1 && diaSemana <= 5;
  const inicio = 12 * 60; // 12:00 p.m.
  const fin = 19 * 60; // 7:00 p.m.

  return esLunesAViernes && minutos >= inicio && minutos < fin;
}

function textoHorarioAsesor() {
  return `🕛 *Horario de atención con asesor:*
Lunes a viernes de *12:00 p.m. a 7:00 p.m.*

Fuera de ese horario puedes dejar tu consulta y un asesor la revisará en el próximo turno disponible.`;
}

function esSolicitudAsesor(msg) {
  return (
    msg.includes("asesor") ||
    msg.includes("agente") ||
    msg.includes("humano") ||
    msg.includes("persona") ||
    msg.includes("hablar con alguien") ||
    msg.includes("quiero hablar") ||
    msg.includes("atencion humana") ||
    msg.includes("atención humana")
  );
}

async function transferirAAsesor(
  from,
  motivo = "Usuario solicitó hablar con asesor"
) {
  const asesorDisponible = esHorarioAsesorDisponible();

  updateSession(from, {
    step: "HUMANO",
    necesitaAsesor: true,
    asesorDisponible,
  });

  console.log(
  "🔔 Transferencia a asesor:",
  from,
  asesorDisponible
    ? `${motivo} - Dentro del horario de asesor`
    : `${motivo} - Fuera del horario de asesor`
);

  if (asesorDisponible) {
    await responder(
      from,
      `Perfecto ✅

Un asesor continuará con tu atención por este mismo chat.

Por favor déjanos tu consulta y en cuanto un asesor esté disponible te responderá.`
    );

    return;
  }

  await responder(
    from,
    `Perfecto ✅

En este momento nuestros asesores no se encuentran disponibles.

${textoHorarioAsesor()}

Déjanos por favor tu consulta en este chat y un asesor te responderá en el próximo horario disponible.

También puedes escribir *menu* si deseas volver al asistente automático.`
  );
}

function resumenCita(datos) {
  return `✅ *Cita preconfirmada - VIP CRC Galerías*

👤 Nombre: *${datos.nombre}*
🪪 Cédula: *${datos.cedula}*
📞 Teléfono: *${datos.telefono}*
📧 Correo: *${datos.correo}*
🚗 Trámite: *${datos.tramite || "Licencia de conducción"}*
📅 Día: *${datos.dia || "Día por confirmar"}*
⏰ Horario aproximado: *${datos.horario}*

📍 Recuerda traer tu documento físico original.

También enviamos la confirmación al correo registrado.`;
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const rawText = textoSeguroMensaje(message);
    const text = limpiarTexto(rawText);

    if (!from || !text) return;

    await procesarMensaje(from, text);
  } catch (error) {
    console.error("❌ Error webhook Meta:", error.message);
  }
});

router.post("/chatwoot", async (req, res) => {
  res.status(200).send("OK");

  try {
    const payload = req.body || {};

    const event = payload.event;
    const messageType = payload.message_type || payload.message?.message_type;
    const content = payload.content || payload.message?.content || "";

    const isPrivate =
      payload.private === true ||
      payload.message?.private === true;

    // Solo procesamos mensajes creados
    if (event && event !== "message_created") return;

    // Solo procesamos mensajes entrantes reales del cliente
    if (messageType !== "incoming") return;

    // Ignoramos notas privadas
    if (isPrivate) return;

    // Ignoramos mensajes vacíos
    if (!content || !String(content).trim()) return;

    // ─────────────────────────────────────────────
    // FILTRO IMPORTANTE POR INBOX
    // Este bot CRC solo debe procesar mensajes del inbox configurado.
    // Evita que mensajes del bot de Curso de Alimentos entren al bot CRC.
    // ─────────────────────────────────────────────
    const expectedInboxId = Number(process.env.CHATWOOT_INBOX_ID || 0);

    const payloadInboxId =
      payload.inbox?.id ||
      payload.inbox_id ||
      payload.conversation?.inbox_id ||
      payload.conversation?.inbox?.id ||
      payload.message?.inbox_id ||
      payload.message?.inbox?.id ||
      payload.conversation?.meta?.inbox?.id ||
      payload.conversation?.contact_inbox?.inbox_id ||
      payload.contact_inbox?.inbox_id ||
      null;

    if (
      expectedInboxId &&
      payloadInboxId &&
      Number(payloadInboxId) !== expectedInboxId
    ) {
      console.log(
        `⏭️ Mensaje ignorado por inbox diferente. Esperado: ${expectedInboxId}, recibido: ${payloadInboxId}`
      );
      return;
    }

    if (expectedInboxId && !payloadInboxId) {
      console.log(
        "⚠️ Webhook Chatwoot sin inbox_id claro. Payload ignorado para evitar mezclar canales."
      );
      return;
    }

    const sender =
      payload.sender ||
      payload.message?.sender ||
      payload.conversation?.contact ||
      payload.contact ||
      {};

    const contact =
      payload.conversation?.contact ||
      payload.contact ||
      sender ||
      {};

    const phone =
      sender.phone_number ||
      contact.phone_number ||
      payload.conversation?.meta?.sender?.phone_number ||
      payload.conversation?.contact_inbox?.source_id ||
      payload.contact_inbox?.source_id ||
      "";

    if (!phone) {
      console.log("⚠️ Webhook Chatwoot sin teléfono:", JSON.stringify(payload));
      return;
    }

    const from = phone.startsWith("whatsapp:")
      ? phone
      : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`;

    const text = limpiarTexto(content);

    console.log("📩 Mensaje recibido desde Chatwoot:", text);
    console.log("Usuario:", from);
    console.log("Inbox Chatwoot:", payloadInboxId);

    await procesarMensaje(from, text, {
      source: "chatwoot",
      skipChatwootIncomingLog: true,
    });
  } catch (error) {
    console.error("❌ Error webhook Chatwoot:", error.message);
  }
});

async function procesarMensaje(from, text, options = {}) {
  const session = getSession(from);
  const msg = text.toLowerCase().trim();

  console.log("Mensaje recibido:", text);
  console.log("Usuario:", from);
  console.log("➡️ Paso actual:", session.step);
  
  if (isRateLimited(from, session.step)) {
  await responder(
    from,
    "⚠️ Has enviado muchos mensajes seguidos.\nPor favor espera un momento."
  );
  return;
}

// Si el usuario está con asesor, el bot NO debe responder automático.
// Solo se reinicia si escribe explícitamente menu, menú, inicio o volver.
if (session.step === "HUMANO") {
  if (["menu", "menú", "inicio", "volver"].includes(msg)) {
    resetSession(from);
    updateSession(from, { step: "MENU_INICIAL" });
    await responder(from, menuInicial());
    return;
  }

  const asesorDisponible = esHorarioAsesorDisponible();

  updateSession(from, {
    asesorDisponible,
  });

 console.log(
  "🔔 Usuario en modo asesor:",
  from,
  asesorDisponible
    ? "Usuario respondió en modo asesor dentro del horario disponible"
    : "Usuario respondió en modo asesor fuera del horario disponible"
);

  if (!asesorDisponible && !session.avisoFueraHorarioEnviado) {
    updateSession(from, {
      avisoFueraHorarioEnviado: true,
    });

    await responder(
      from,
      `Gracias ✅

Tu mensaje quedó registrado para el asesor.

${textoHorarioAsesor()}

Un asesor te responderá en el próximo horario disponible.`
    );
  }

  return;
}

if (["hola", "buenas", "menu", "menú", "inicio", "volver"].includes(msg)) {
  resetSession(from);
  updateSession(from, { step: "MENU_INICIAL" });
  await responder(from, menuInicial());
  return;
}

if (esSolicitudAsesor(msg)) {
  await transferirAAsesor(from, "Usuario escribió palabra clave de asesor");
  return;
}
  if (session.step === "MENU_INICIAL") {
    if (msg === "1" || msg.includes("crc")) {
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC" });
      await responder(from, menuPrincipal());
      return;
    }

    if (msg === "2" || msg.includes("cia") || msg.includes("simit")) {
      updateSession(from, { step: "CIA_MENU", linea: "CIA" });
      await responder(from, menuCia());
      return;
    }

    await responder(from, menuInicial());
    return;
  }

  // ─────────────────────────────────────────────
  // FLUJO CIA VIP / SIMIT
  // ─────────────────────────────────────────────

  if (session.step === "CIA_MENU") {
    if (msg === "1") {
      updateSession(from, { step: "CIA_AUTORIZACION" });
      await responder(
        from,
        `Para consultar SIMIT necesitamos tu autorización.

Responde *ACEPTO* para autorizar a *CIA VIP* a consultar tu información en SIMIT con fines de orientación sobre comparendos.`
      );
      return;
    }

    if (msg === "2") {
      resetSession(from);
      updateSession(from, { step: "MENU_INICIAL" });
      await responder(from, menuInicial());
      return;
    }

    await responder(from, menuCia());
    return;
  }

  if (session.step === "CIA_AUTORIZACION") {
    if (!msg.includes("acepto")) {
      await responder(from, "Para continuar debes responder *ACEPTO*.");
      return;
    }

    updateSession(from, { step: "CIA_DOCUMENTO" });
    await responder(
      from,
      "Perfecto ✅\n\nEnvíame el número de cédula o placa que deseas consultar en SIMIT."
    );
    return;
  }

  if (session.step === "CIA_DOCUMENTO") {
    const documento = text.replace(/\s+/g, "").toUpperCase();

    if (documento.length < 5) {
      await responder(from, "⚠️ Envía una cédula o placa válida.");
      return;
    }

    await responder(
      from,
      "🔎 Estoy consultando SIMIT. Esto puede tardar unos segundos..."
    );

    try {
      const resultado = await consultarSimitPorDocumento(documento);
      const respuesta = formatearResultadoSimitWhatsApp(documento, resultado);

      if (Array.isArray(respuesta)) {
        for (const mensaje of respuesta) {
          await responder(from, mensaje);
          await esperar(900);
        }
      } else {
        await responder(from, respuesta);
      }

      updateSession(from, {
        step: "CIA_FINAL",
        documentoSimit: documento,
      });
    } catch (error) {
      console.error("❌ Error SIMIT:", error.message);
      await responder(
        from,
        "⚠️ En este momento no fue posible consultar SIMIT.\nPor favor intenta más tarde o escribe *asesor*."
      );
    }

    return;
  }

  if (session.step === "CIA_FINAL") {
    if (
  msg === "1" ||
  msg.includes("asesor") ||
  msg.includes("si") ||
  msg.includes("sí")
) {
  await transferirAAsesor(from, "Usuario solicitó asesor desde flujo CIA / SIMIT");
  return;
}

    if (msg === "2" || msg.includes("volver") || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_INICIAL" });
      await responder(from, menuInicial());
      return;
    }

    await responder(
      from,
      `¿Deseas continuar?

1️⃣ Hablar con asesor
2️⃣ Volver al inicio`
    );
    return;
  }

  // ─────────────────────────────────────────────
  // FLUJO CRC
  // ─────────────────────────────────────────────

  if (session.step === "MENU_PRINCIPAL") {
    if (msg === "1") {
      updateSession(from, { step: "MENU_TRAMITE" });
      await responder(from, menuTramite());
      return;
    }

    if (msg === "2") {
      updateSession(from, { step: "MENU_INFORMACION" });
      await responder(from, menuInformacion());
      return;
    }

    if (msg === "3" || msg.includes("asesor")) {
  await transferirAAsesor(from, "Usuario eligió hablar con asesor desde menú principal CRC");
  return;
}

    await responder(from, menuPrincipal());
    return;
  }

  if (session.step === "MENU_TRAMITE") {
    if (msg === "1") {
      updateSession(from, {
        tramite: "Renovación / Refrendación",
        step: "COMPARENDO",
      });
      await responder(
        from,
        "¿Tienes comparendos pendientes?\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro"
      );
      return;
    }

    if (msg === "2") {
      updateSession(from, {
        tramite: "Primera vez",
        step: "COMPARENDO",
      });
      await responder(
        from,
        "¿Tienes comparendos pendientes?\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro"
      );
      return;
    }

    if (msg === "3") {
      resetSession(from);
      updateSession(from, { step: "MENU_INICIAL" });
      await responder(from, menuInicial());
      return;
    }

    await responder(from, menuTramite());
    return;
  }

  if (session.step === "MENU_INFORMACION") {
    if (msg === "1") {
      await responder(from, getMessage("precios"));
      await responder(from, menuInformacionCorto());
      return;
    }

    if (msg === "2") {
      await responder(from, getMessage("duracion"));
      await responder(from, menuInformacionCorto());
      return;
    }

    if (msg === "3") {
      await responder(from, getMessage("horarios"));
      await responder(from, menuInformacionCorto());
      return;
    }

    if (msg === "4") {
      await responder(from, getMessage("pagos"));
      await responder(from, menuInformacionCorto());
      return;
    }

    if (msg === "5") {
      await responder(from, getMessage("proceso"));
      await responder(from, menuInformacionCorto());
      return;
    }

    if (msg === "6") {
      await responder(from, getMessage("ubicacion"));
      await responder(from, menuInformacionCorto());
      return;
    }

    if (msg === "7") {
      resetSession(from);
      updateSession(from, { step: "MENU_INICIAL" });
      await responder(from, menuInicial());
      return;
    }

    await responder(from, menuInformacion());
    return;
  }

  // ─────────────────────────────────────────────
  // COMPARENDOS ANTES DE RUNT
  // ─────────────────────────────────────────────

  if (session.step === "COMPARENDO") {
    let comparendos = null;

    if (
      msg === "1" ||
      msg === "si" ||
      msg === "sí" ||
      msg.includes("tengo comparendo") ||
      msg.includes("tengo comparendos") ||
      msg.includes("si tengo") ||
      msg.includes("sí tengo")
    ) {
      comparendos = "Sí";
    }

    if (
      msg === "2" ||
      msg === "no" ||
      msg.includes("no tengo") ||
      msg.includes("sin comparendo") ||
      msg.includes("sin comparendos")
    ) {
      comparendos = "No";
    }

    if (
      msg === "3" ||
      msg.includes("no se") ||
      msg.includes("no sé") ||
      msg.includes("nose") ||
      msg.includes("no estoy seguro") ||
      msg.includes("no estoy segura") ||
      msg.includes("no recuerdo")
    ) {
      comparendos = "No estoy seguro";
    }

    if (!comparendos) {
      await responder(
        from,
        "Por favor responde con una opción válida:\n\n1️⃣ Sí tengo comparendos\n2️⃣ No tengo comparendos\n3️⃣ No estoy seguro"
      );
      return;
    }

    if (comparendos === "Sí") {
      updateSession(from, {
        comparendos,
        step: "COMPARENDO_SIMIT_DOCUMENTO",
      });

      await responder(
        from,
        `Entiendo ✅

Para validar mejor tu caso, primero vamos a consultar en SIMIT si tienes comparendos o multas registradas.

Por favor envíame tu número de cédula sin puntos ni espacios.`
      );
      return;
    }

    if (comparendos === "No") {
      updateSession(from, {
        comparendos,
        step: "CEDULA",
      });

      await responder(
        from,
        `Perfecto ✅

Entonces vamos a revisar tu información en RUNT para validar el estado de tu licencia y orientarte con el trámite correcto.

Por favor envíame tu número de cédula sin puntos ni espacios.`
      );
      return;
    }

    if (comparendos === "No estoy seguro") {
      updateSession(from, {
        comparendos,
        step: "CEDULA",
      });

      await responder(
        from,
        `Tranquilo ✅ Eso es muy común.

Podemos avanzar revisando primero tu información en RUNT y, si es necesario, también te orientamos para validar en SIMIT si aparece algún comparendo pendiente.

Por favor envíame tu número de cédula sin puntos ni espacios.`
      );
      return;
    }
  }

  if (session.step === "COMPARENDO_SIMIT_DOCUMENTO") {
    const documento = text.replace(/\s+/g, "").toUpperCase();

    if (documento.length < 5) {
      await responder(
        from,
        "⚠️ Por favor envía una cédula válida, sin puntos ni espacios."
      );
      return;
    }

    updateSession(from, {
      cedula: documento,
      documentoSimit: documento,
    });

    await responder(
      from,
      "🔎 Estoy consultando SIMIT para validar si aparece algún comparendo o multa pendiente.\nEsto puede tardar unos segundos..."
    );

    try {
      const resultadoSimit = await consultarSimitPorDocumento(documento);
      const respuestaSimit = formatearResultadoSimitWhatsApp(
        documento,
        resultadoSimit
      );

      await enviarRespuestaSimitCRC(from, respuestaSimit);

      if (tienePendientesSimit(resultadoSimit)) {
        updateSession(from, {
          step: "SIMIT_DECISION_CRC",
          simitTienePendientes: true,
          cedula: documento,
          documentoSimit: documento,
        });

        await responder(
          from,
          `Según la consulta, aparece información pendiente en SIMIT.

Te explico de forma sencilla:

✅ Si es *comparendo* y todavía aplica descuento, nosotros podemos orientarte con el curso.
⚠️ Si ya aparece como *multa o resolución*, normalmente debes realizar el pago para poder continuar con el trámite final de la licencia.

De todas formas, el examen médico del CRC tiene una vigencia de *6 meses*, así que puedes adelantar esa parte y dejarla lista mientras solucionas lo pendiente.

¿Qué deseas hacer?

1️⃣ Hablar con un asesor para comparendos
2️⃣ Seguir con la consulta de renovación en RUNT`
        );
        return;
      }

      await responder(
        from,
        `Excelente ✅

No aparecen comparendos ni multas pendientes en SIMIT.

Ahora vamos a continuar revisando tu información en RUNT para validar el estado de tu licencia.`
      );

      await consultarRuntYContinuar(from, documento);
      return;
    } catch (error) {
      console.error("❌ Error SIMIT:", error.message);

      await responder(
        from,
        `⚠️ En este momento no fue posible consultar SIMIT.

Podemos continuar revisando tu información en RUNT para orientarte con el trámite.

Recuerda que si tienes comparendos o multas pendientes, el trámite final de la licencia puede quedar detenido hasta solucionarlo.`
      );

      await consultarRuntYContinuar(from, documento);
      return;
    }
  }

  if (session.step === "SIMIT_DECISION_CRC") {
    if (
  msg === "1" ||
  msg.includes("asesor") ||
  msg.includes("comparendo") ||
  msg.includes("comparendos") ||
  msg.includes("multa") ||
  msg.includes("simit") ||
  msg.includes("ayuda")
) {
  await transferirAAsesor(from, "Usuario solicitó asesor por comparendos / SIMIT desde flujo CRC");
  return;
}

    if (
      msg === "2" ||
      msg.includes("seguir") ||
      msg.includes("continuar") ||
      msg.includes("renovacion") ||
      msg.includes("renovación") ||
      msg.includes("runt") ||
      msg.includes("licencia")
    ) {
      const cedula = session.cedula || session.documentoSimit;

      if (!cedula) {
        updateSession(from, {
          step: "CEDULA",
        });

        await responder(
          from,
          "Perfecto ✅\n\nPara continuar con la revisión en RUNT, envíame tu número de cédula."
        );
        return;
      }

      await responder(
        from,
        `Perfecto ✅

Continuemos con la revisión de tu renovación.

Recuerda: si SIMIT muestra una multa o comparendo pendiente, el trámite final de la licencia puede quedar detenido hasta solucionarlo.

De todas formas, vamos a revisar tu información en RUNT.`
      );

      await consultarRuntYContinuar(from, cedula);
      return;
    }

    await responder(
      from,
      `Por favor responde con una opción:

1️⃣ Hablar con asesor para comparendos
2️⃣ Seguir con consulta de renovación en RUNT`
    );
    return;
  }

  // ─────────────────────────────────────────────
  // FLUJO RUNT NORMAL
  // ─────────────────────────────────────────────

  if (session.step === "CEDULA") {
    if (!esCedulaValida(text)) {
      await responder(
        from,
        "⚠️ Por favor envía solo el número de cédula, sin puntos ni espacios."
      );
      return;
    }

    await consultarRuntYContinuar(from, text);
    return;
  }

  if (session.step === "AGENDAR") {
  if (
    msg === "1" ||
    msg.includes("si") ||
    msg.includes("sí") ||
    msg.includes("agendar") ||
    msg.includes("cita") ||
    msg.includes("quiero")
  ) {
    updateSession(from, {
  step: "DIA_CITA",
});

await responder(from, menuDiasCita());
return;
  }

  if (msg === "2" || msg.includes("no") || msg.includes("menu")) {
    resetSession(from);
    updateSession(from, { step: "MENU_INICIAL" });

    await responder(
      from,
      `Entendido ✅

Recuerda que puedes escribir *menu* cuando quieras retomar el proceso.`
    );

    await responder(from, menuInicial());
    return;
  }

  await responder(
    from,
    `¿Deseas que te ayudemos a dejar tu atención preconfirmada?

1️⃣ Sí, quiero agendar
2️⃣ No por ahora`
  );
  return;
}

if (session.step === "DIA_CITA") {
  const dia = detectarDia(msg);

  if (!dia) {
    await responder(from, menuDiasCita());
    return;
  }

  if (dia.tipo === "otro") {
    updateSession(from, {
      diaCita: "Otro día",
      fechaCitaISO: null,
      step: "DIA_PERSONALIZADO",
    });

    await responder(
      from,
      `Perfecto ✅

Indícanos qué día deseas asistir.

Ejemplo:
*viernes 8 de mayo de 2026*
*lunes 11 de mayo de 2026*
*15 de mayo de 2026*
*la otra semana*`
    );
    return;
  }

  let fechaSeleccionada = dia.fecha;

  if (!esDiaLaboralCRC(fechaSeleccionada)) {
    const siguiente = obtenerSiguienteDiaLaboral(sumarDias(fechaSeleccionada, 1));

    updateSession(from, {
      diaCita: formatearFechaColombia(siguiente),
      fechaCitaISO: fechaKey(siguiente),
      step: "HORARIO_CITA",
    });

    await responder(
      from,
      `Ese día no tenemos atención porque es domingo o festivo.

Te puedo ofrecer el siguiente día hábil:

📅 *${formatearFechaColombia(siguiente)}*`
    );

    await responder(from, menuHorariosCita(siguiente));
    return;
  }

  let slots = obtenerSlotsDisponibles(fechaSeleccionada);

  if (slots.length === 0) {
    const siguiente = obtenerSiguienteDiaLaboral(sumarDias(fechaSeleccionada, 1));

    updateSession(from, {
      diaCita: formatearFechaColombia(siguiente),
      fechaCitaISO: fechaKey(siguiente),
      step: "HORARIO_CITA",
    });

    await responder(
      from,
      `Para el día de hoy ya no tenemos disponibilidad.

Te puedo ofrecer el siguiente día hábil:

📅 *${formatearFechaColombia(siguiente)}*`
    );

    await responder(from, menuHorariosCita(siguiente));
    return;
  }

  updateSession(from, {
    diaCita: dia.texto,
    fechaCitaISO: fechaKey(fechaSeleccionada),
    step: "HORARIO_CITA",
  });

  await responder(from, menuHorariosCita(fechaSeleccionada));
  return;
}

if (session.step === "DIA_PERSONALIZADO") {
  const diaPersonalizado = text.trim();

  if (diaPersonalizado.length < 3) {
    await responder(
      from,
      "Por favor indícanos un día más claro. Ejemplo: *viernes 8 de mayo de 2026*, *lunes* o *15 de mayo*."
    );
    return;
  }

  updateSession(from, {
    diaCita: diaPersonalizado,
    fechaCitaISO: null,
    step: "HORARIO_CITA",
  });

  await responder(
    from,
    `Listo ✅

Día solicitado:
📅 *${diaPersonalizado}*

Ahora elige un horario aproximado de llegada.`
  );

  await responder(
    from,
    `Horarios disponibles habituales:

1️⃣ 7:00 a.m. a 9:00 a.m.
2️⃣ 9:00 a.m. a 11:00 a.m.
3️⃣ 11:00 a.m. a 1:00 p.m.
4️⃣ 1:00 p.m. a 3:30 p.m.
5️⃣ Otro horario

Recuerda:
Lunes a viernes: 7:00 a.m. a 3:30 p.m.
Sábados: 7:00 a.m. a 11:00 a.m.
Domingos y festivos: no laboramos.`
  );
  return;
}
  
if (session.step === "HORARIO_CITA") {
  const fechaCita = session.fechaCitaISO
    ? new Date(`${session.fechaCitaISO}T12:00:00-05:00`)
    : null;

  const horario = session.fechaCitaISO
    ? detectarHorario(msg, fechaCita)
    : detectarHorario(msg, null);

  if (!horario) {
    if (session.fechaCitaISO) {
      await responder(from, menuHorariosCita(fechaCita));
    } else {
      await responder(
        from,
        `Por favor responde con una opción válida:

1️⃣ 7:00 a.m. a 9:00 a.m.
2️⃣ 9:00 a.m. a 11:00 a.m.
3️⃣ 11:00 a.m. a 1:00 p.m.
4️⃣ 1:00 p.m. a 3:30 p.m.
5️⃣ Otro horario`
      );
    }
    return;
  }

  updateSession(from, {
    step: "NOMBRE_CITA",
    horarioCita: horario,
  });

  if (horario === "Otro horario") {
    await responder(
      from,
      `Perfecto ✅

Indícanos el horario aproximado que prefieres.

Ejemplo:
*10:00 a.m.*
*Después de las 2:00 p.m.*
*En la mañana*`
    );

    updateSession(from, {
      step: "HORARIO_PERSONALIZADO",
    });

    return;
  }

  await responder(
    from,
    `Perfecto ✅

Día seleccionado:
📅 *${session.diaCita || "Día por confirmar"}*

Horario seleccionado:
⏰ *${horario}*

Ahora envíame tu *nombre completo*.`
  );
  return;
}

if (session.step === "HORARIO_PERSONALIZADO") {
  const horarioPersonalizado = text.trim();

  if (horarioPersonalizado.length < 4) {
    await responder(
      from,
      "Por favor indícanos un horario aproximado más claro."
    );
    return;
  }

  updateSession(from, {
    step: "NOMBRE_CITA",
    horarioCita: horarioPersonalizado,
  });

  await responder(
    from,
    `Listo ✅

Horario solicitado:
⏰ *${horarioPersonalizado}*

Ahora envíame tu *nombre completo*.`
  );
  return;
}

if (session.step === "NOMBRE_CITA") {
  const nombre = text.trim();

  if (nombre.length < 5 || !nombre.includes(" ")) {
    await responder(
      from,
      "Por favor envíame tu *nombre completo*, con nombre y apellido."
    );
    return;
  }

  updateSession(from, {
    step: "CEDULA_CITA",
    nombreCita: nombre,
  });

  await responder(
    from,
    `Gracias, *${nombre}* ✅

Ahora envíame tu *número de cédula*, sin puntos ni espacios.`
  );
  return;
}

if (session.step === "CEDULA_CITA") {
  const cedula = text.replace(/\D/g, "");

  if (!esCedulaValida(cedula)) {
    await responder(
      from,
      "⚠️ Por favor envía una cédula válida, solo números, sin puntos ni espacios."
    );
    return;
  }

  updateSession(from, {
    step: "TELEFONO_CITA",
    cedulaCita: cedula,
  });

  await responder(
    from,
    `Perfecto ✅

Ahora envíame tu *número de teléfono de contacto*.`
  );
  return;
}

if (session.step === "TELEFONO_CITA") {
  const telefono = text.replace(/\D/g, "");

  if (!esTelefonoValido(telefono)) {
    await responder(
      from,
      "⚠️ Por favor envía un número de teléfono válido."
    );
    return;
  }

  updateSession(from, {
    step: "CORREO_CITA",
    telefonoCita: telefono,
  });

  await responder(
    from,
    `Gracias ✅

Ahora envíame tu *correo electrónico* para enviarte la confirmación de la cita.`
  );
  return;
}

if (session.step === "CORREO_CITA") {
  const correo = text.trim().toLowerCase();

  if (!esCorreoValido(correo)) {
    await responder(
      from,
      "⚠️ Por favor envía un correo válido.\n\nEjemplo: nombre@gmail.com"
    );
    return;
  }

  updateSession(from, {
    step: "CONFIRMAR_CITA",
    correoCita: correo,
  });

  const datos = {
  nombre: session.nombreCita,
  cedula: session.cedulaCita || session.cedula,
  telefono: session.telefonoCita,
  correo,
  dia: session.diaCita || "Día por confirmar",
  horario: session.horarioCita || "Horario por confirmar",
  tramite: session.tramite || "Licencia de conducción",
};

  await responder(
    from,
    `Por favor confirma que los datos estén correctos:

👤 Nombre: *${datos.nombre}*
🪪 Cédula: *${datos.cedula}*
📞 Teléfono: *${datos.telefono}*
📧 Correo: *${datos.correo}*
🚗 Trámite: *${datos.tramite}*
📅 Día: *${datos.dia}*
⏰ Horario: *${datos.horario}*

1️⃣ Confirmar cita
2️⃣ Corregir datos`
  );
  return;
}

if (session.step === "ENVIANDO_CORREO_CITA") {
  await responder(
    from,
    "Estamos procesando tu confirmación y enviando el correo ✅\nPor favor espera un momento."
  );
  return;
}
  
if (session.step === "CONFIRMAR_CITA") {
  if (
    msg === "2" ||
    msg.includes("corregir") ||
    msg.includes("editar") ||
    msg.includes("cambiar")
  ) {
    updateSession(from, {
  step: "DIA_CITA",
  diaCita: null,
  fechaCitaISO: null,
  horarioCita: null,
  nombreCita: null,
  cedulaCita: null,
  telefonoCita: null,
  correoCita: null,
});

    await responder(
      from,
      `Sin problema ✅

Vamos a tomar los datos nuevamente.`
    );

    await responder(from, menuDiasCita());
    return;
  }

  if (
    msg !== "1" &&
    !msg.includes("confirmar") &&
    !msg.includes("si") &&
    !msg.includes("sí") &&
    !msg.includes("correcto")
  ) {
    await responder(
      from,
      `Por favor responde:

1️⃣ Confirmar cita
2️⃣ Corregir datos`
    );
    return;
  }

  const datos = {
  nombre: session.nombreCita,
  cedula: session.cedulaCita || session.cedula,
  telefono: session.telefonoCita,
  correo: session.correoCita,
  dia: session.diaCita || "Día por confirmar",
  horario: session.horarioCita || "Horario por confirmar",
  tramite: session.tramite || "Licencia de conducción",
};

  await responder(
    from,
    "Estoy guardando tu solicitud y enviando la confirmación al correo ✅"
  );
  updateSession(from, {
  step: "ENVIANDO_CORREO_CITA",
});

  try {
    await enviarCorreoCita(datos);

    await responder(from, resumenCita(datos));
  } catch (error) {
    console.error("❌ Error enviando correo:", error.message);

    await responder(
      from,
      `✅ *Solicitud de cita recibida*

Tus datos quedaron registrados en esta conversación, pero en este momento no fue posible enviar el correo automático.

👤 Nombre: *${datos.nombre}*
🪪 Cédula: *${datos.cedula}*
📞 Teléfono: *${datos.telefono}*
📧 Correo: *${datos.correo}*
🚗 Trámite: *${datos.tramite}*
📅 Día: *${datos.dia}*
⏰ Horario: *${datos.horario}*

Un asesor continuará con la confirmación final.`
    );
  }

  resetSession(from);
  return;
}

  if (session.step === "DATOS_CITA") {
    const horario = session.horarioCita || "Horario por confirmar";

    await responder(
      from,
      `✅ *Solicitud de cita recibida*

Gracias por la información.

⏰ Horario aproximado: *${horario}*

Un asesor de *VIP CRC Galerías* continuará con la confirmación final de tu atención.

Recuerda traer tu documento físico original.`
    );

    resetSession(from);
    return;
  }

  resetSession(from);
  updateSession(from, { step: "MENU_INICIAL" });
  await responder(from, menuInicial());
}

function menuInicial() {
  return `Hola 👋 Bienvenido a *CRC VIP Galerías* y *CIA VIP*.

¿En qué podemos ayudarte hoy?

1️⃣ CRC - Licencias de conducción
2️⃣ CIA VIP - Comparendos / SIMIT

Escribe el número de la opción.`;
}

function menuPrincipal() {
  return `Hola gracias por escribir a *VIP CRC Galerías*.

¿Cómo podemos ayudarte hoy?

1️⃣ Quiero sacar o renovar mi licencia
2️⃣ Quiero información del proceso
3️⃣ Hablar con asesor

También puedes escribir *menu* para volver al inicio.`;
}

function menuCia() {
  return `Bienvenido a *CIA VIP* 🚗

¿Qué deseas hacer?

1️⃣ Consultar comparendos en SIMIT
2️⃣ Volver al inicio`;
}

function menuTramite() {
  return `Perfecto 🚗 ¿Qué trámite deseas realizar?

1️⃣ Renovación / Refrendación
2️⃣ Primera vez
3️⃣ Volver al menú principal`;
}

function menuInformacion() {
  return `Claro ✅ ¿Qué información deseas consultar?

1️⃣ Precios y descuentos
2️⃣ Duración del proceso
3️⃣ Horarios de atención
4️⃣ Medios de pago
5️⃣ Proceso del examen
6️⃣ Ubicación
7️⃣ Volver al menú principal`;
}

function menuInformacionCorto() {
  return `¿Deseas consultar algo más?

1️⃣ Precios y descuentos
2️⃣ Duración del proceso
3️⃣ Horarios
4️⃣ Medios de pago
5️⃣ Proceso del examen
6️⃣ Ubicación
7️⃣ Volver al inicio`;
}

module.exports = router;
