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
} = require("../services/chatwoot");
const {
  getSession,
  updateSession,
  resetSession,
  setReplyTarget,
  getAllSessions,
} = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const {
  detectarOpcionDia,
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
} = require("../utils/agenda");

const ASESOR_TIMEOUT_MS = 10 * 60 * 1000;
const processedIncomingMessages = new Map();

function normalizarTelefono(valor) {
  return String(valor || "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");
}

function normalizarCedula(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function esDuplicado(from, text, options = {}) {
  const now = Date.now();
  const source = String(options.source || "unknown");
  const messageId = options.messageId ? String(options.messageId) : null;

  if (messageId) {
    const idKey = `id:${messageId}`;
    const last = processedIncomingMessages.get(idKey);
    if (last && now - last.time < 60000) return true;
    processedIncomingMessages.set(idKey, { time: now, source, messageId });
  }

  const contentKey = `content:${normalizarTelefono(from)}::${String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;

  const previous = processedIncomingMessages.get(contentKey);
  if (previous && now - previous.time < 4000) {
    const diferenteFuente = previous.source !== source;
    const faltaId = !messageId || !previous.messageId;
    if (diferenteFuente || faltaId) return true;
  }

  processedIncomingMessages.set(contentKey, { time: now, source, messageId });

  for (const [key, data] of processedIncomingMessages.entries()) {
    if (now - Number(data?.time || 0) > 120000) {
      processedIncomingMessages.delete(key);
    }
  }

  return false;
}

function textoSeguroMeta(message) {
  return (
    message?.text?.body ||
    message?.interactive?.button_reply?.id ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.id ||
    message?.interactive?.list_reply?.title ||
    ""
  );
}

function esSi(msg) {
  const t = String(msg || "").trim().toLowerCase();
  return ["1", "si", "sí", "claro", "ok", "okay", "dale", "quiero"].includes(t) ||
    t.startsWith("si ") ||
    t.startsWith("sí ");
}

function esNo(msg) {
  const t = String(msg || "").trim().toLowerCase();
  return ["2", "no", "no gracias", "por ahora no"].includes(t) || t.startsWith("no ");
}

function esComandoInicio(msg) {
  return ["menu", "menú", "inicio", "volver", "reiniciar"].includes(
    String(msg || "").trim().toLowerCase()
  );
}

function esSolicitudAsesor(msg) {
  const t = String(msg || "").trim().toLowerCase();
  return (
    t === "asesor" ||
    t.includes("hablar con asesor") ||
    t.includes("hablar con un asesor") ||
    t.includes("agente humano") ||
    t.includes("hablar con alguien") ||
    t.includes("persona real")
  );
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
  return `Perfecto ✅

Si tu licencia es categoría *A1, A2, B1, B2, C1, C2 o C3*, tenemos una promoción especial este mes.

💰 *Renovación o refrendación: $180.000*

📍 Estamos ubicados en *Cra. 28A #51-70, barrio Galerías – Bogotá*.
🚗 Contamos con parqueadero.

Atendemos normalmente por *orden de llegada*, pero si agendas una cita, *respetaremos la hora programada*.

Aceptamos diferentes medios de pago.

¿Deseas agendar tu cita?

1️⃣ Sí
2️⃣ No`;
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
  return `Perfecto ✅

También realizamos el examen para quienes van a sacar su licencia *por primera vez*.

¿Deseas agendar tu atención?

1️⃣ Sí
2️⃣ No`;
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
  const respuestas = {
    "1": `💰 *Precios*

• Renovación o refrendación de una categoría: *$180.000*
• Dos categorías en combo: *$250.000*

Aplican categorías A1, A2, B1, B2, C1, C2 o C3.`,
    "2": `⏱️ *Duración aproximada*

El proceso del examen CRC normalmente tarda entre *40 y 60 minutos*, dependiendo del flujo de atención.`,
    "3": `🕒 *Horarios de atención*

Lunes a viernes: *7:00 a.m. a 3:30 p.m.*
Sábados: *7:00 a.m. a 11:30 a.m.*
Domingos y festivos: *no laboramos*.`,
    "4": `💳 *Medios de pago*

Aceptamos diferentes medios de pago. Si necesitas confirmar un medio específico, puedes escribir *asesor*.`,
    "5": `🚗 *Proceso*

1. Eliges fecha y horario aproximado.
2. Registramos tus datos.
3. Confirmamos tu solicitud.
4. Asistes al CRC con tu documento físico original.`,
    "6": `📍 *Ubicación*

*VIP CRC Galerías*
Cra. 28A #51-70, barrio Galerías – Bogotá.

🚗 Contamos con parqueadero.`,
  };

  return respuestas[String(opcion)] || null;
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
  return `✅ *Cita preconfirmada - VIP CRC Galerías*

👤 Nombre: *${datos.nombre}*
🪪 Cédula: *${datos.cedula}*
📞 Teléfono: *${datos.telefono}*
📧 Correo: ${datos.correo}
🚗 Trámite: *${datos.tramite}*
📅 Día: *${datos.dia}*
⏰ Horario aproximado: *${datos.horario}*

📍 *VIP CRC Galerías*
Cra. 28A #51-70, barrio Galerías – Bogotá.

📄 Si necesitas validar la habilitación del centro, un asesor puede compartirte los documentos correspondientes.

Recuerda traer tu documento físico original.

También enviamos la confirmación al correo registrado.`;
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

  Stats.mensajeEnviado(to, texto.slice(0, 120));
  await logOutgoingMessage(to, texto);
  return result;
}

function asesorSigueActivo(session) {
  return Boolean(
    session?.botPausadoPorAsesor &&
      session?.asesorLastAt &&
      Date.now() - Number(session.asesorLastAt) < ASESOR_TIMEOUT_MS
  );
}

async function transferirAAsesor(from, motivo = "Usuario solicitó hablar con asesor") {
  Stats.asesorActivado(from, motivo);
  await markNeedsAgent(from, motivo).catch((error) => {
    console.error("⚠️ No se pudo marcar para asesor:", error.message);
  });

  updateSession(from, {
    step: "HUMANO",
    necesitaAsesor: true,
    asesorActivo: true,
    botPausadoPorAsesor: true,
    asesorLastAt: Date.now(),
    avisoReactivacionBotEnviado: false,
  });

  await responder(
    from,
    `Perfecto ✅

Un asesor continuará con tu atención por este mismo chat.

Déjanos tu consulta y te responderemos en cuanto sea posible.`
  );
}

async function reactivarBotPorInactividad(from, session) {
  if (!session?.botPausadoPorAsesor || asesorSigueActivo(session)) return;
  if (session.avisoReactivacionBotEnviado) return;

  resetSession(from);
  updateSession(from, {
    step: "RENOVACION_INTERES",
    linea: "CRC",
    replyTo: from,
    avisoReactivacionBotEnviado: true,
  });

  await responder(
    from,
    `Hola 👋

Como no hemos tenido actividad reciente del asesor, el asistente automático vuelve a estar disponible.

${mensajePreguntaRenovacion()}`
  );
}

setInterval(async () => {
  try {
    for (const [from, session] of getAllSessions()) {
      if (session?.botPausadoPorAsesor && !asesorSigueActivo(session)) {
        await reactivarBotPorInactividad(from, session);
      }
    }
  } catch (error) {
    console.error("❌ Error verificando inactividad de asesor:", error.message);
  }
}, 60 * 1000).unref();

function detectarHorario(msg, fecha) {
  const slots = obtenerSlotsDisponibles(fecha);
  const numero = Number(String(msg || "").trim());

  if (Number.isInteger(numero) && numero >= 1 && numero <= slots.length) {
    return slots[numero - 1].texto;
  }

  if (Number.isInteger(numero) && numero === slots.length + 1) {
    return "Otro horario";
  }

  const texto = String(msg || "").toLowerCase();
  if (texto.includes("otro") || texto.includes("diferente")) {
    return "Otro horario";
  }

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

  await responder(from, menuHorariosCita(seleccionada));
}

async function manejarDiaCita(from, text) {
  const seleccion = detectarOpcionDia(text);

  if (!seleccion) {
    await responder(from, menuDiasDisponibles());
    return;
  }

  if (seleccion.tipo === "otro") {
    updateSession(from, {
      step: "DIA_PERSONALIZADO",
      diaCita: "Otro día",
      fechaCitaISO: null,
      fechaSugeridaISO: null,
    });
    await responder(from, mensajePedirOtroDia());
    return;
  }

  await guardarFechaYMostrarHorarios(from, seleccion.fecha);
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
  if (esDuplicado(from, text, options)) return;

  Stats.mensajeRecibido(from);
  setReplyTarget(from, from);

  if (!options.skipChatwootIncomingLog) {
    await logIncomingMessage(from, text).catch((error) => {
      console.error("⚠️ No se pudo registrar incoming en Chatwoot:", error.message);
    });
  }

  let session = getSession(from);
  const msg = String(text || "").trim().toLowerCase();

  if (session.botPausadoPorAsesor) {
    if (esComandoInicio(msg)) {
      reiniciarFlujo(from);
      await responder(from, mensajePreguntaRenovacion());
      return;
    }

    if (asesorSigueActivo(session)) return;
    await reactivarBotPorInactividad(from, session);
    return;
  }

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

  // El primer mensaje del usuario SIEMPRE inicia la interacción propuesta:
  // no importa si escribió "hola", "quiero renovar", una pregunta o cualquier otro texto.
  if (session.step === "MENU_INICIAL") {
    updateSession(from, {
      step: "RENOVACION_INTERES",
      linea: "CRC",
      replyTo: from,
    });
    await responder(from, mensajePreguntaRenovacion());
    return;
  }

  if (session.step === "RENOVACION_INTERES") {
    if (esSi(msg)) {
      updateSession(from, {
        step: "AGENDAR_RENOVACION",
        tramite: "Renovación / Refrendación",
      });
      await responder(from, mensajePromocionRenovacion());
      return;
    }

    if (esNo(msg)) {
      updateSession(from, { step: "NO_RENOVACION", tramite: null });
      await responder(from, menuNoRenovacion());
      return;
    }

    await responder(from, mensajePreguntaRenovacion());
    return;
  }

  if (session.step === "AGENDAR_RENOVACION") {
    if (esSi(msg) || msg.includes("agendar")) {
      updateSession(from, {
        step: "DIA_CITA",
        tramite: "Renovación / Refrendación",
      });
      await responder(from, menuDiasDisponibles());
      return;
    }

    if (esNo(msg)) {
      updateSession(from, { step: "NO_RENOVACION" });
      await responder(from, menuNoRenovacion());
      return;
    }

    await responder(from, mensajePromocionRenovacion());
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

    await responder(from, menuNoRenovacion());
    return;
  }

  if (session.step === "AGENDAR_PRIMERA_VEZ") {
    if (esSi(msg) || msg.includes("agendar")) {
      updateSession(from, {
        step: "DIA_CITA",
        tramite: "Primera vez",
      });
      await responder(from, menuDiasDisponibles());
      return;
    }

    if (esNo(msg)) {
      updateSession(from, { step: "NO_RENOVACION" });
      await responder(from, menuNoRenovacion());
      return;
    }

    await responder(from, mensajePrimeraVez());
    return;
  }

  if (session.step === "MENU_INFORMACION") {
    if (msg === "7") {
      reiniciarFlujo(from);
      await responder(from, mensajePreguntaRenovacion());
      return;
    }

    const info = respuestaInformacion(msg);
    if (info) {
      await responder(from, `${info}\n\n${menuInformacion()}`);
      return;
    }

    if (esSolicitudAsesor(msg)) {
      await transferirAAsesor(from);
      return;
    }

    await responder(from, menuInformacion());
    return;
  }

  if (session.step === "DIA_CITA") {
    await manejarDiaCita(from, text);
    return;
  }

  if (session.step === "DIA_PERSONALIZADO") {
    await manejarDiaPersonalizado(from, text, session);
    return;
  }

  if (session.step === "HORARIO_CITA") {
    const fecha = fechaDesdeISO(session.fechaCitaISO);

    if (!fecha) {
      updateSession(from, { step: "DIA_CITA" });
      await responder(from, menuDiasDisponibles());
      return;
    }

    const horario = detectarHorario(msg, fecha);
    if (!horario) {
      await responder(from, menuHorariosCita(fecha));
      return;
    }

    if (horario === "Otro horario") {
      updateSession(from, { step: "HORARIO_PERSONALIZADO" });
      await responder(
        from,
        `Perfecto ✅

Indícanos el horario aproximado que prefieres.

Ejemplo:
*10:00 a.m.*
*Después de las 2:00 p.m.*
*En la mañana*`
      );
      return;
    }

    updateSession(from, {
      step: "NOMBRE_CITA",
      horarioCita: horario,
    });
    await responder(from, mensajeNombre());
    return;
  }

  if (session.step === "HORARIO_PERSONALIZADO") {
    const horario = String(text || "").trim();
    if (horario.length < 4) {
      await responder(from, "Por favor indícanos un horario aproximado más claro.");
      return;
    }

    updateSession(from, {
      step: "NOMBRE_CITA",
      horarioCita: horario,
    });
    await responder(from, mensajeNombre());
    return;
  }

  if (session.step === "NOMBRE_CITA") {
    const nombre = String(text || "").trim().replace(/\s+/g, " ");
    if (nombre.length < 5 || !nombre.includes(" ") || /\d/.test(nombre)) {
      await responder(
        from,
        "Por favor envíame tu *nombre completo*, con nombre y apellido y sin números."
      );
      return;
    }

    updateSession(from, {
      step: "CEDULA_CITA",
      nombreCita: nombre,
    });
    await responder(from, mensajeCedula());
    return;
  }

  if (session.step === "CEDULA_CITA") {
    const cedula = normalizarCedula(text);
    if (!esCedulaValida(cedula)) {
      await responder(
        from,
        "⚠️ Por favor envía una cédula válida, solo números, con o sin puntos."
      );
      return;
    }

    updateSession(from, {
      step: "TELEFONO_CITA",
      cedulaCita: cedula,
    });
    await responder(from, mensajeTelefono());
    return;
  }

  if (session.step === "TELEFONO_CITA") {
    const telefono = String(text || "").replace(/\D/g, "");
    if (!esTelefonoValido(telefono)) {
      await responder(from, "⚠️ Por favor envía un número de teléfono válido.");
      return;
    }

    updateSession(from, {
      step: "CORREO_CITA",
      telefonoCita: telefono,
    });
    await responder(from, mensajeCorreo());
    return;
  }

  if (session.step === "CORREO_CITA") {
    const correo = String(text || "").trim().toLowerCase();
    if (!esCorreoValido(correo)) {
      await responder(
        from,
        "⚠️ Por favor envía un correo válido. Ejemplo: nombre@gmail.com"
      );
      return;
    }

    updateSession(from, {
      step: "CONFIRMAR_CITA",
      correoCita: correo,
    });
    await responder(from, mensajeConfirmacion(getSession(from)));
    return;
  }

  if (session.step === "CONFIRMAR_CITA") {
    if (msg === "2" || msg.includes("corregir") || msg.includes("cambiar")) {
      const tramite = session.tramite;
      reiniciarFlujo(from);
      updateSession(from, {
        step: "DIA_CITA",
        tramite,
      });
      await responder(
        from,
        `Sin problema ✅

Vamos a tomar los datos nuevamente.

${menuDiasDisponibles()}`
      );
      return;
    }

    if (!(msg === "1" || esSi(msg) || msg.includes("confirmar") || msg.includes("correcto"))) {
      await responder(from, "Por favor responde:\n\n1️⃣ Confirmar cita\n2️⃣ Corregir datos");
      return;
    }

    const datos = {
      nombre: session.nombreCita,
      cedula: session.cedulaCita,
      telefono: session.telefonoCita,
      correo: session.correoCita,
      tramite: session.tramite || "Licencia de conducción",
      dia: session.diaCita || "Día por confirmar",
      horario: session.horarioCita || "Horario por confirmar",
    };

    updateSession(from, { step: "ENVIANDO_CORREO_CITA" });
    await responder(
      from,
      "Estoy guardando tu solicitud y enviando la confirmación al correo ✅"
    );

    try {
      await enviarCorreoCita(datos);
      Stats.citaPreconfirmada(from, datos.nombre || "usuario");
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
📧 Correo: ${datos.correo}
🚗 Trámite: *${datos.tramite}*
📅 Día: *${datos.dia}*
⏰ Horario: *${datos.horario}*

Un asesor continuará con la confirmación final.`
      );
    }

    resetSession(from);
    return;
  }

  if (session.step === "ENVIANDO_CORREO_CITA") {
    await responder(
      from,
      "Estamos procesando tu confirmación. Por favor espera un momento."
    );
    return;
  }

  if (session.step === "HUMANO") {
    return;
  }

  reiniciarFlujo(from);
  await responder(from, mensajePreguntaRenovacion());
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
    const text = limpiarTexto(textoSeguroMeta(message));
    if (!from || !text) return;

    await procesarMensaje(from, text, {
      source: "meta",
      messageId: message.id || null,
    });
  } catch (error) {
    console.error("❌ Error webhook Meta:", error.message);
  }
});

router.post("/twilio", async (req, res) => {
  res.status(200).send("OK");

  try {
    const from = req.body.From;
    const text = limpiarTexto(req.body.Body);
    if (!from || !text) return;

    await procesarMensaje(from, text, {
      source: "twilio",
      messageId: req.body.MessageSid || req.body.SmsMessageSid || null,
    });
  } catch (error) {
    console.error("❌ Error webhook Twilio:", error.message);
  }
});

router.post("/chatwoot", async (req, res) => {
  res.status(200).send("OK");

  try {
    const payload = req.body || {};
    const event = payload.event;
    const messageType = payload.message_type || payload.message?.message_type;
    const content = payload.content || payload.message?.content || "";
    const isPrivate = payload.private === true || payload.message?.private === true;

    if (isPrivate) return;
    if (event && event !== "message_created") return;

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
      (!payloadInboxId || Number(payloadInboxId) !== expectedInboxId)
    ) {
      return;
    }

    const sender =
      payload.sender ||
      payload.message?.sender ||
      payload.conversation?.contact ||
      payload.contact ||
      {};
    const contact = payload.conversation?.contact || payload.contact || sender || {};

    const phone =
      sender.phone_number ||
      contact.phone_number ||
      payload.conversation?.meta?.sender?.phone_number ||
      payload.conversation?.contact_inbox?.source_id ||
      payload.contact_inbox?.source_id ||
      "";

    if (!phone) return;

    const from = phone.startsWith("whatsapp:")
      ? phone
      : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`;

    if (messageType === "outgoing") {
      updateSession(from, {
        step: "HUMANO",
        necesitaAsesor: true,
        asesorActivo: true,
        botPausadoPorAsesor: true,
        asesorLastAt: Date.now(),
        avisoReactivacionBotEnviado: false,
      });
      console.log("👤 Asesor tomó la conversación:", from);
      return;
    }

    if (messageType !== "incoming" || !String(content).trim()) return;

    await procesarMensaje(from, limpiarTexto(content), {
      source: "chatwoot",
      skipChatwootIncomingLog: true,
      messageId:
        payload.id ||
        payload.message?.id ||
        payload.message_id ||
        payload.content_attributes?.external_id ||
        null,
    });
  } catch (error) {
    console.error("❌ Error webhook Chatwoot:", error.message);
  }
});

module.exports = router;
