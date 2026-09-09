"use strict";

const express = require("express");
const router = express.Router();

const { VERIFY_TOKEN } = require("../config");
const Stats = require("../services/stats");
const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");
const { enviarCorreoCita } = require("../services/email");
const {
  logIncomingMessage,
  logOutgoingMessage,
  markNeedsAgent,
  rememberConversation,
} = require("../services/chatwoot");
const {
  getSession,
  updateSession,
  resetSession,
  setReplyTarget,
} = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const {
  esFechaPasada,
  fechaKey,
  formatearFechaColombia,
  menuDiasDisponibles,
  menuHorariosCita,
  motivoNoLaboral,
  obtenerSiguienteDiaDisponible,
  obtenerSlotsDisponibles,
  parsearFechaUsuario,
  sumarDias,
  obtenerProximosDiasDisponibles,
  validarHorarioPersonalizado,
  horarioSigueDisponible,
} = require("../utils/agenda");

const { randomUUID } = require("node:crypto");
const { extractIncoming, phoneKey } = require("../utils/incoming");
const { enqueue, isDuplicate } = require("../utils/messageQueue");
const { answerQuestion, normalize, safeFallback } = require("../services/answers");
const { business, catalog } = require("../services/knowledge");
const { createAgendaReminders } = require("../services/agendaReminders");

function normalizarCedula(valor) {
  return String(valor || "").replace(/\D/g, "");
}



function esSi(msg) {
  return /^(1|si+|claro|ok|okay|dale|de acuerdo|confirmar cita|si quiero|si deseo|si por favor|si gracias|si deseo renovar|si quiero renovar|si me interesa|si estoy interesad[oa]( en renovar( la licencia)?)?)[.! ]*$/.test(normalize(msg));
}
function esNo(msg) {
  return /^(2|no|no gracias|por ahora no|no quiero|no deseo|no quiero agendar|no deseo agendar|por el momento no)[.! ]*$/.test(normalize(msg));
}
function esComandoInicio(msg) {
  return /^(menu|inicio|volver|reiniciar)$/.test(normalize(msg));
}
function esSolicitudAsesor(msg) {
  return /\b(asesor|asesora|agente humano|hablar con alguien|persona real|atencion humana)\b/.test(normalize(msg)) &&
    !/\b(no quiero|no necesito)\b/.test(normalize(msg));
}

function esCorreoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || "").trim());
}

function esTelefonoValido(telefono) {
  const limpio = String(telefono || "").replace(/\D/g, "");
  return limpio.length >= 7 && limpio.length <= 13;
}

function fechaDesdeISO(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  );
}

function mensajePreguntaRenovacion() {
  return `Hola, bienvenido(a) a *VIP CRC Galerías*.

¿Estás interesado(a) en *renovar tu licencia de conducción*?

1️⃣ Sí
2️⃣ No

Responde con el número de la opción.`;
}

function mensajePromocionRenovacion() {
  return catalog().precios + "\n\n📍 " + business.address + "\nCómo llegar: " + business.maps +
    "\n\n¿Deseas agendar tu cita?\n\n1️⃣ Sí\n2️⃣ No";
}

function menuNoRenovacion() {
  return `Entendido ✅

También podemos ayudarte con:

1️⃣ Sacar la licencia por primera vez
2️⃣ Información del proceso
3️⃣ Hablar con asesor

Responde con el número de la opción.`;
}

function mensajePrimeraVez() {
  return catalog().primera_vez + "\n\n¿Deseas agendar tu atención?\n\n1️⃣ Sí\n2️⃣ No";
}

function menuInformacion() {
  return `Claro ✅ ¿Qué información deseas consultar?

1️⃣ Precios
2️⃣ Duración del proceso
3️⃣ Horarios de atención
4️⃣ Medios de pago
5️⃣ Proceso paso a paso
6️⃣ Ubicación
7️⃣ Volver al inicio`;
}

function respuestaInformacion(opcion) {
  const ids = { "1": "precios", "2": "duracion", "3": "horarios", "4": "pagos", "5": "proceso", "6": "ubicacion" };
  return catalog()[ids[opcion]] || null;
}

function mensajePedirOtroDia() {
  return `Perfecto ✅

Escríbeme la fecha en la que deseas asistir.

Puedes enviarla así:
• *viernes*
• *15 de septiembre*
• *15/09/2026*

El sistema verificará automáticamente domingos y festivos.`;
}

function mensajeNombre() {
  return `Perfecto ✅

Ahora envíame tu *nombre completo*.`;
}

function mensajeCedula() {
  return `Gracias ✅

Ahora envíame tu *número de cédula*, con o sin puntos.`;
}

function mensajeTelefono() {
  return `Perfecto ✅

Ahora envíame tu *número de celular o teléfono de contacto*.`;
}

function mensajeCorreo() {
  return `Gracias ✅

Ahora envíame tu *correo electrónico* para enviarte la confirmación.`;
}

function mensajeConfirmacion(session) {
  return `Por favor confirma que los datos estén correctos:

👤 Nombre: *${session.nombreCita || ""}*
🪪 Cédula: *${session.cedulaCita || ""}*
📞 Teléfono: *${session.telefonoCita || ""}*
📧 Correo: ${session.correoCita || ""}
🚗 Trámite: *${session.tramite || "Licencia de conducción"}*
📅 Día: *${session.diaCita || "Día por confirmar"}*
⏰ Horario: *${session.horarioCita || "Horario por confirmar"}*

1️⃣ Confirmar cita
2️⃣ Corregir datos`;
}

function resumenCita(datos) {
  return "✅ *Solicitud de cita enviada - VIP CRC Galerías*\n\n" +
    "👤 Nombre: *" + datos.nombre + "*\n" +
    "📅 Día: *" + datos.dia + "*\n⏰ Horario aproximado: *" + datos.horario + "*\n" +
    "Referencia: " + datos.solicitudId + "\n\n" +
    "Enviamos la solicitud al correo registrado. La disponibilidad y la hora final deben ser confirmadas por el centro.\n\n" +
    "📍 " + business.address + "\n" + business.maps + "\nTrae tu documento físico original.";
}

async function responder(to, body) {
  const texto = String(body || "").trim();
  if (!texto) return null;

  let result = null;
  if (String(to).startsWith("whatsapp:")) {
    result = await sendTwilioText(to, texto);
  } else {
    result = await sendText(to, texto);
  }

  if (!result) throw new Error("El canal no aceptó el mensaje");
  Stats.mensajeEnviado(to, "Respuesta del bot: " + getSession(to).step);
  void logOutgoingMessage(to, texto).catch(() => Stats.error(to, "No se pudo registrar la respuesta en Chatwoot"));
  return result;
}

async function transferirAAsesor(from, motivo = "Usuario solicitó hablar con asesor") {
  updateSession(from, {
    step: "HUMANO", necesitaAsesor: true, asesorActivo: true,
    botPausadoPorAsesor: true, asesorLastAt: Date.now(),
  });
  Stats.asesorActivado(from, motivo);
  const result = await markNeedsAgent(from, motivo).catch(() => null);
  await responder(from, result
    ? "Dejé tu solicitud para un asesor. Déjanos tu consulta y el equipo te responderá por este chat cuando esté disponible.\n\nEscribe *menú* si quieres volver al asistente automático."
    : "No pude notificar automáticamente al equipo en este momento. Deja tu consulta en este chat para que puedan revisarla.\n\nEscribe *menú* si quieres volver al asistente automático.");
}
async function mostrarDias(from, prefix = "") {
  const dias = obtenerProximosDiasDisponibles(2).map(fechaKey);
  updateSession(from, { step: "DIA_CITA", diasOfrecidos: dias });
  await responder(from, (prefix ? prefix + "\n\n" : "") + menuDiasDisponibles(dias.map(fechaDesdeISO)));
}
async function mostrarHorarios(from, fecha) {
  const slots = obtenerSlotsDisponibles(fecha);
  updateSession(from, { step: "HORARIO_CITA", horariosOfrecidos: slots });
  await responder(from, menuHorariosCita(fecha, slots));
}
async function despuesDeDato(from, patch, nextStep, prompt) {
  const session = getSession(from);
  updateSession(from, { ...patch, step: session.corrigiendo ? "CONFIRMAR_CITA" : nextStep, corrigiendo: false, noEntendidos: 0 });
  await responder(from, session.corrigiendo ? mensajeConfirmacion(getSession(from)) : prompt);
}
function continuacion(session) {
  const prompts = {
    RENOVACION_INTERES: "¿Deseas renovar? Responde *1 (sí)* o *2 (no)*.",
    AGENDAR_RENOVACION: "¿Agendamos? Responde *1 (sí)* o *2 (no)*.",
    AGENDAR_PRIMERA_VEZ: "¿Agendamos? Responde *1 (sí)* o *2 (no)*.",
    NO_RENOVACION: "Puedes elegir *1 Primera vez*, *2 Información* o *3 Asesor*.",
    MENU_INFORMACION: "Puedes hacer otra pregunta, escribir *agendar* o *asesor*.",
    DIA_CITA: "Elige una de las fechas que te mostré o escribe una fecha.",
    DIA_PERSONALIZADO: "¿Qué fecha prefieres?",
    HORARIO_CITA: "Elige un horario de la lista o escribe la hora que prefieres.",
    HORARIO_PERSONALIZADO: "¿A qué hora prefieres asistir?",
    NOMBRE_CITA: "Para continuar, envía tu nombre completo.",
    CEDULA_CITA: "Para continuar, envía tu número de cédula.",
    TELEFONO_CITA: "Para continuar, envía tu celular o escribe *este número*.",
    CORREO_CITA: "Para continuar, envía tu correo o escribe *no tengo correo*.",
    CONFIRMAR_CITA: "Responde *1* para enviar la solicitud o *2* para corregir un dato.",
    CORREGIR_CITA: "¿Qué dato quieres corregir? Elige una opción del menú anterior.",
  };
  return prompts[session.step] ? "\n\n" + prompts[session.step] : "";
}
async function noEntendido(from, prompt) {
  const count = (getSession(from).noEntendidos || 0) + 1;
  updateSession(from, { noEntendidos: count });
  Stats.mensajeNoReconocido(from, "Entrada fuera del paso " + getSession(from).step);
  if (count >= 3) return transferirAAsesor(from, "Tres respuestas no comprendidas en el flujo");
  await responder(from, "No pude identificar esa respuesta. " + prompt + "\nTambién puedes escribir *asesor*.");
}

function detectarHorario(msg, fecha, session) {
  const slots = session.horariosOfrecidos || [];
  const numero = Number(String(msg || "").trim());
  if (Number.isInteger(numero) && numero >= 1 && numero <= slots.length) {
    const selected = slots[numero - 1];
    if (!obtenerSlotsDisponibles(fecha).some((s) => s.inicio === selected.inicio && s.fin === selected.fin)) return "VENCIDO";
    return selected;
  }
  if (numero === slots.length + 1 || /otro|diferente/.test(normalize(msg))) return "OTRO";
  return null;
}

async function guardarFechaYMostrarHorarios(from, fecha) {
  let seleccionada = fecha;
  let slots = obtenerSlotsDisponibles(seleccionada);

  if (!slots.length) {
    const siguiente = obtenerSiguienteDiaDisponible(sumarDias(seleccionada, 1));
    if (!siguiente) {
      await transferirAAsesor(from, "No se encontró un próximo día disponible");
      return;
    }

    seleccionada = siguiente;
    await responder(
      from,
      `El horario del día elegido ya finalizó.

El siguiente día disponible es:
📅 *${formatearFechaColombia(seleccionada)}*`
    );
  }

  updateSession(from, {
    step: "HORARIO_CITA",
    diaCita: formatearFechaColombia(seleccionada),
    fechaCitaISO: fechaKey(seleccionada),
    fechaSugeridaISO: null,
  });

  await mostrarHorarios(from, seleccionada);
}

async function manejarDiaCita(from, text) {
  const session = getSession(from);
  const opcion = String(text || "").trim();
  if (["1", "2"].includes(opcion)) {
    const iso = (session.diasOfrecidos || [])[Number(opcion) - 1];
    const fecha = fechaDesdeISO(iso);
    if (!fecha || esFechaPasada(fecha) || motivoNoLaboral(fecha) || !obtenerSlotsDisponibles(fecha).length) {
      await responder(from, "La fecha seleccionada ya no está disponible. Te muestro las opciones actuales.");
      return mostrarDias(from);
    }
    return guardarFechaYMostrarHorarios(from, fecha);
  }
  if (opcion === "3" || /^(otro|otro dia|otra fecha)$/.test(normalize(text))) {
    updateSession(from, { step: "DIA_PERSONALIZADO", fechaSugeridaISO: null });
    return responder(from, mensajePedirOtroDia());
  }
  if (parsearFechaUsuario(text)) return manejarDiaPersonalizado(from, text, session);
  return noEntendido(from, "Elige *1*, *2* u *otro día*; también puedes escribir una fecha.");
}

async function manejarDiaPersonalizado(from, text, session) {
  const msg = String(text || "").trim().toLowerCase();
  const fecha =
    msg === "1" && session.fechaSugeridaISO
      ? fechaDesdeISO(session.fechaSugeridaISO)
      : parsearFechaUsuario(text);

  if (!fecha) {
    await responder(
      from,
      `No pude identificar una fecha exacta.

${mensajePedirOtroDia()}`
    );
    return;
  }

  if (esFechaPasada(fecha)) {
    await responder(
      from,
      `La fecha *${formatearFechaColombia(fecha)}* ya pasó.

Por favor envíame una fecha futura.`
    );
    return;
  }

  const motivo = motivoNoLaboral(fecha);
  if (motivo) {
    const siguiente = obtenerSiguienteDiaDisponible(sumarDias(fecha, 1));

    if (!siguiente) {
      await responder(
        from,
        `Ese día no tenemos atención porque es *${motivo}*.

Por favor envíame otra fecha.`
      );
      return;
    }

    updateSession(from, { fechaSugeridaISO: fechaKey(siguiente) });
    await responder(
      from,
      `Ese día no tenemos atención porque es *${motivo}*.

El siguiente día disponible es:
📅 *${formatearFechaColombia(siguiente)}*

1️⃣ Sí, usar ese día

O escríbeme otra fecha.`
    );
    return;
  }

  await guardarFechaYMostrarHorarios(from, fecha);
}

function reiniciarFlujo(from) {
  resetSession(from);
  return updateSession(from, {
    step: "RENOVACION_INTERES",
    linea: "CRC",
    replyTo: from,
  });
}

async function procesarMensaje(from, text, options = {}) {
  Stats.mensajeRecibido(from);
  setReplyTarget(from, from);

  if (!options.skipChatwootIncomingLog) {
    void logIncomingMessage(from, text).catch(() => Stats.error(from, "No se pudo registrar la entrada en Chatwoot"));
  }

  let session = getSession(from);
  const msg = String(text || "").trim().toLowerCase();

  if (session.botPausadoPorAsesor && !esComandoInicio(msg)) return;
  if (isRateLimited(from, session.step)) {
    Stats.rateLimitado(from);
    await responder(
      from,
      "⚠️ Has enviado muchos mensajes seguidos. Por favor espera un momento."
    );
    return;
  }

  if (esComandoInicio(msg)) {
    reiniciarFlujo(from);
    await responder(from, mensajePreguntaRenovacion());
    return;
  }


  if (esSolicitudAsesor(msg)) return transferirAAsesor(from);
  if (/^(no me escriban|no mas mensajes|no quiero mensajes|baja|stop|detener)$/.test(normalize(msg))) {
    updateSession(from, { step: "HUMANO", botPausadoPorAsesor: true, noContactar: true });
    await markNeedsAgent(from, "El usuario solicita detener la automatización").catch(() => null);
    return responder(from, "Entendido. Detengo las respuestas automáticas. Puedes escribir *menú* si deseas retomarlas.");
  }
  if (session.step === "ENVIANDO_CORREO_CITA") return;
  if (options.media && !text) {
    return responder(from, "Recibí un archivo o audio. En este momento no puedo interpretarlo. Escríbeme tu consulta o escribe *asesor* para que el equipo lo revise." + continuacion(session));
  }
  if (session.step === "MENU_INICIAL") {
    session = updateSession(from, { step: "RENOVACION_INTERES", linea: "CRC", replyTo: from });
    const initialAnswer = await answerQuestion(text, session);
    if (initialAnswer) updateSession(from, { lastIntent: initialAnswer.intents[0] });
    if (initialAnswer?.redirect) return responder(from, initialAnswer.text);
    return responder(from, (initialAnswer ? initialAnswer.text + "\n\n" : "") + mensajePreguntaRenovacion());
  }
  if (/^(gracias|muchas gracias|listo gracias|ok gracias|chao|adios)[.! ]*$/.test(normalize(msg))) {
    return responder(from, "Con gusto. Estamos atentos a ayudarte." + continuacion(session));
  }
  if (/^(no entiendo|no entendi|no se|no entiendo nada)$/.test(normalize(msg))) {
    return noEntendido(from, continuacion(session).trim() || "Cuéntame qué necesitas.");
  }
  if (normalize(msg) === "no tengo correo" && session.step === "CORREO_CITA") {
    return transferirAAsesor(from, "El usuario no tiene correo para la solicitud de cita");
  }
  if (normalize(msg) === "agendar" && ["MENU_INFORMACION", "CITA_ENVIADA", "NO_RENOVACION"].includes(session.step)) {
    return mostrarDias(from);
  }
  if (/^(renovar|quiero renovar|deseo renovar|si quiero renovar|si estoy interesado|si estoy interesada)$/.test(normalize(msg)) &&
      ["RENOVACION_INTERES", "NO_RENOVACION", "MENU_INFORMACION", "CITA_ENVIADA"].includes(session.step)) {
    updateSession(from, { tramite: "Renovación / Refrendación", step: "AGENDAR_RENOVACION",
      recordatorioAgendaEnviado: false, recordatorioAgendaCancelado: false });
    return responder(from, mensajePromocionRenovacion());
  }
  if (["RENOVACION_INTERES", "NO_RENOVACION", "MENU_INFORMACION"].includes(session.step) &&
      /^(quiero |deseo |necesito )?(sacar |tramitar |obtener )?(la licencia )?(por )?primera vez[.! ]*$/.test(normalize(msg))) {
    updateSession(from, { step: "AGENDAR_PRIMERA_VEZ", tramite: "Primera vez" });
    return responder(from, mensajePrimeraVez());
  }
  const choice = ["RENOVACION_INTERES", "AGENDAR_RENOVACION", "AGENDAR_PRIMERA_VEZ"].includes(session.step) &&
    (esSi(msg) || esNo(msg) || /^(agendar|quiero agendar|si agendar)$/.test(normalize(msg)));
  const answer = choice ? null : await answerQuestion(text, session);
  if (answer) {
    updateSession(from, { lastIntent: answer.intents[0], noEntendidos: 0,
      ...(answer.redirect ? { recordatorioAgendaCancelado: true } : {}) });
    return responder(from, answer.text + (answer.redirect ? "" : continuacion(session)));
  }
  if (session.step === "RENOVACION_INTERES") {
    if (esSi(msg)) {
      updateSession(from, {
        step: "AGENDAR_RENOVACION",
        tramite: "Renovación / Refrendación",
        recordatorioAgendaEnviado: false,
        recordatorioAgendaCancelado: false,
      });
      return responder(from, mensajePromocionRenovacion());
    }

    if (esNo(msg)) {
      updateSession(from, { step: "NO_RENOVACION", tramite: null });
      await responder(from, menuNoRenovacion());
      return;
    }

    return noEntendido(from, "¿Deseas renovar? Responde *1 (sí)* o *2 (no)*.");
  }

  if (session.step === "AGENDAR_RENOVACION") {
    if (esSi(msg) || /^(agendar|quiero agendar|si agendar)$/.test(normalize(msg))) {
      updateSession(from, {
        step: "DIA_CITA",
        tramite: "Renovación / Refrendación",
      });
      await mostrarDias(from);
      return;
    }

    if (esNo(msg)) {
      updateSession(from, { step: "NO_RENOVACION" });
      await responder(from, menuNoRenovacion());
      return;
    }

    await noEntendido(from, "¿Agendamos? Responde *1 (sí)* o *2 (no)*.");
    return;
  }

  if (session.step === "NO_RENOVACION") {
    if (msg === "1" || msg.includes("primera vez")) {
      updateSession(from, {
        step: "AGENDAR_PRIMERA_VEZ",
        tramite: "Primera vez",
      });
      await responder(from, mensajePrimeraVez());
      return;
    }

    if (msg === "2" || msg.includes("informacion") || msg.includes("información")) {
      updateSession(from, { step: "MENU_INFORMACION" });
      await responder(from, menuInformacion());
      return;
    }

    if (msg === "3" || esSolicitudAsesor(msg)) {
      await transferirAAsesor(from);
      return;
    }

    return noEntendido(from, "Elige *1 Primera vez*, *2 Información* o *3 Asesor*.");
  }

  if (session.step === "AGENDAR_PRIMERA_VEZ") {
    if (esSi(msg) || /^(agendar|quiero agendar|si agendar)$/.test(normalize(msg))) {
      updateSession(from, {
        step: "DIA_CITA",
        tramite: "Primera vez",
      });
      await mostrarDias(from);
      return;
    }

    if (esNo(msg)) {
      updateSession(from, { step: "NO_RENOVACION" });
      await responder(from, menuNoRenovacion());
      return;
    }

    return noEntendido(from, "¿Agendamos? Responde *1 (sí)* o *2 (no)*.");
  }

  if (session.step === "MENU_INFORMACION") {
    if (msg === "7") {
      reiniciarFlujo(from);
      await responder(from, mensajePreguntaRenovacion());
      return;
    }

    const info = respuestaInformacion(msg);
    if (info) {
      await responder(from, info + "\n\nPuedes hacer otra pregunta, escribir *agendar* o *asesor*.");
      return;
    }

    if (esSolicitudAsesor(msg)) {
      await transferirAAsesor(from);
      return;
    }

    return noEntendido(from, safeFallback);
  }

  if (session.step === "DIA_CITA") {
    await manejarDiaCita(from, text);
    return;
  }

  if (session.step === "DIA_PERSONALIZADO") {
    await manejarDiaPersonalizado(from, text, session);
    return;
  }

  if (["HORARIO_CITA", "HORARIO_PERSONALIZADO"].includes(session.step)) {
    const fecha = fechaDesdeISO(session.fechaCitaISO);
    if (!fecha || esFechaPasada(fecha) || !obtenerSlotsDisponibles(fecha).length) {
      await responder(from, "La fecha u horario ya no está disponible. Elige una nueva fecha.");
      return mostrarDias(from);
    }
    const selection = session.step === "HORARIO_CITA" ? detectarHorario(msg, fecha, session) : null;
    if (selection === "VENCIDO") {
      await responder(from, "Ese horario ya finalizó. Te muestro los horarios actuales.");
      return mostrarHorarios(from, fecha);
    }
    if (selection === "OTRO") {
      updateSession(from, { step: "HORARIO_PERSONALIZADO" });
      return responder(from, "Escribe la hora que prefieres, por ejemplo *10:00 a.m.* o *2:00 p.m.*. Debe estar dentro del horario de atención.");
    }
    const horario = selection || validarHorarioPersonalizado(text, fecha);
    if (!horario) return noEntendido(from, "Elige un horario de la lista o escribe una hora dentro del horario de atención.");
    return despuesDeDato(from, { horarioCita: horario.texto, horarioSeleccionado: horario }, "NOMBRE_CITA", mensajeNombre());
  }

  if (session.step === "NOMBRE_CITA") {
    const nombre = String(text || "").trim().replace(/\s+/g, " ");
    if (nombre.length < 5 || nombre.length > 100 || !/^[\p{L}][\p{L} .\u0027’-]+$/u.test(nombre) || !nombre.includes(" ") || /\b(quiero|necesito|tengo|entiendo|asesor|correo|cedula|informacion|bueno|vale)\b/.test(normalize(nombre))) {
      await responder(
        from,
        "Por favor envíame tu *nombre completo*, con nombre y apellido y sin números."
      );
      return;
    }

    return despuesDeDato(from, { nombreCita: nombre }, "CEDULA_CITA", mensajeCedula());
  }

  if (session.step === "CEDULA_CITA") {
    const cedula = normalizarCedula(text);
    if (!/^[\d.\s-]+$/.test(text) || !esCedulaValida(cedula)) {
      await responder(
        from,
        "⚠️ Por favor envía una cédula válida, solo números, con o sin puntos."
      );
      return;
    }

    return despuesDeDato(from, { cedulaCita: cedula }, "TELEFONO_CITA", mensajeTelefono() + "\nTambién puedes escribir *este número*.");
  }

  if (session.step === "TELEFONO_CITA") {
    const mismo = /^(este numero|el mismo|este)$/.test(normalize(text));
    const telefono = mismo ? phoneKey(from) : /^[+\d.\s-]+$/.test(text) ? phoneKey(text) : "";
    if (!esTelefonoValido(telefono)) {
      await responder(from, "⚠️ Por favor envía un número de teléfono válido.");
      return;
    }

    return despuesDeDato(from, { telefonoCita: telefono }, "CORREO_CITA", mensajeCorreo() + "\nSi no tienes, escribe *no tengo correo*.");
  }

  if (session.step === "CORREO_CITA") {
    const correo = String(text || "").trim().toLowerCase();
    if (correo.length > 254 || !esCorreoValido(correo)) {
      await responder(
        from,
        "⚠️ Por favor envía un correo válido. Ejemplo: nombre@gmail.com"
      );
      return;
    }

    updateSession(from, {
      step: "CONFIRMAR_CITA",
      correoCita: correo,
      corrigiendo: false,
    });
    await responder(from, mensajeConfirmacion(getSession(from)));
    return;
  }

  if (session.step === "CORREGIR_CITA") {
    const field = {
      "1": ["NOMBRE_CITA", mensajeNombre()],
      "2": ["CEDULA_CITA", mensajeCedula()],
      "3": ["TELEFONO_CITA", mensajeTelefono()],
      "4": ["CORREO_CITA", mensajeCorreo()],
    }[msg];
    if (field) {
      updateSession(from, { step: field[0], corrigiendo: true });
      return responder(from, field[1]);
    }
    if (msg === "5") {
      updateSession(from, { corrigiendo: true });
      return mostrarDias(from);
    }
    if (msg === "6") {
      const fecha = fechaDesdeISO(session.fechaCitaISO);
      updateSession(from, { corrigiendo: true });
      return fecha && obtenerSlotsDisponibles(fecha).length ? mostrarHorarios(from, fecha) : mostrarDias(from);
    }
    return noEntendido(from, "Elige un dato del 1 al 6.");
  }
  if (session.step === "CONFIRMAR_CITA") {
    if (msg === "2" || /^(corregir|corregir datos|cambiar)$/.test(normalize(msg))) {
      updateSession(from, { step: "CORREGIR_CITA" });
      return responder(from, "¿Qué deseas corregir?\n1️⃣ Nombre\n2️⃣ Cédula\n3️⃣ Teléfono\n4️⃣ Correo\n5️⃣ Fecha\n6️⃣ Horario");
    }
    if (!esSi(msg) && !/^(confirmar|correcto)$/.test(normalize(msg))) {
      return noEntendido(from, "Responde *1* para enviar la solicitud o *2* para corregir un dato.");
    }
    const fecha = fechaDesdeISO(session.fechaCitaISO);
    if (!horarioSigueDisponible(fecha, session.horarioSeleccionado)) {
      updateSession(from, { corrigiendo: true });
      await responder(from, "El horario elegido ya no está disponible. Conservé tus datos; elige una nueva fecha.");
      return mostrarDias(from);
    }
    const solicitudId = session.solicitudId || randomUUID();
    const datos = {
      nombre: session.nombreCita, cedula: session.cedulaCita, telefono: session.telefonoCita,
      correo: session.correoCita, tramite: session.tramite || "Licencia de conducción",
      dia: session.diaCita, horario: session.horarioCita, fechaISO: session.fechaCitaISO, solicitudId,
    };
    updateSession(from, { step: "ENVIANDO_CORREO_CITA", solicitudId });
    let sent = false;
    try {
      await enviarCorreoCita(datos);
      sent = true;
    } catch {
      Stats.error(from, "No se pudo confirmar el envío de correo de la solicitud");
    }
    if (sent) {
      Stats.citaPreconfirmada(from);
      resetSession(from);
      updateSession(from, { step: "CITA_ENVIADA", solicitudId });
      await responder(from, resumenCita(datos));
    } else {
      await responder(from, "No pude confirmar el envío del correo. Tu solicitud sigue pendiente de revisión; no repitas el envío. Voy a dejar el caso al equipo para verificarlo.");
      await transferirAAsesor(from, "Verificar solicitud " + solicitudId + "; envío de correo no confirmado. Datos en esta conversación.");
    }
    return;
  }
  if (session.step === "CITA_ENVIADA") {
    return responder(from, "Tu solicitud fue enviada. Para revisarla, cambiarla o cancelarla escribe *asesor*. Para otra solicitud, escribe *agendar*.");
  }

  if (session.step === "HUMANO") {
    return;
  }

  reiniciarFlujo(from);
  await responder(from, mensajePreguntaRenovacion());
}


const reminders = createAgendaReminders({
  getSession, updateSession, enqueue, sendDates: mostrarDias,
  onError: (from) => {
    Stats.error(from, "No se pudo enviar el recordatorio de agenda");
    updateSession(from, { step: "HUMANO", botPausadoPorAsesor: true });
    void markNeedsAgent(from, "Revisar recordatorio de agenda no enviado").catch(() => null);
  },
});
async function handleIncoming(incoming) {
  if (isDuplicate(incoming)) {
    Stats.duplicadoIgnorado(incoming.from);
    return;
  }
  reminders.cancel(incoming.from);
  return enqueue(incoming.from, async () => {
    if (incoming.conversationId) await rememberConversation(incoming.from, incoming.conversationId).catch(() => null);
    if (incoming.human) {
      updateSession(incoming.from, { step: "HUMANO", botPausadoPorAsesor: true, asesorLastAt: Date.now() });
      return;
    }
    try {
      await procesarMensaje(incoming.from, incoming.text || "", incoming);
      reminders.schedule(incoming.from);
    } catch (error) {
      Stats.error(incoming.from, "Fallo procesando o enviando respuesta");
      console.error("Error de procesamiento:", error.name);
      updateSession(incoming.from, { step: "HUMANO", botPausadoPorAsesor: true });
      await markNeedsAgent(incoming.from, "Error de respuesta; revisar conversación antes de continuar").catch(() => null);
    }
  });
}
router.get("/", (req, res) => {
  if (VERIFY_TOKEN && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    return res.status(200).send(String(req.query["hub.challenge"] || ""));
  }
  return res.sendStatus(403);
});
for (const route of ["/", "/twilio", "/chatwoot"]) {
  router.post(route, (req, res) => {
    let events;
    try { events = extractIncoming(req.path, req.body || {}); }
    catch { return res.status(400).json({ error: "Evento inválido" }); }
    if (route === "/twilio") res.type("text/xml").status(200).send("<Response/>");
    else res.status(200).send("OK");
    for (const incoming of events) {
      void handleIncoming(incoming).catch(() => Stats.error(incoming.from, "Cola de mensajes saturada"));
    }
  });
}
router.handleIncoming = handleIncoming;
router.close = () => reminders.close();
module.exports = router;
