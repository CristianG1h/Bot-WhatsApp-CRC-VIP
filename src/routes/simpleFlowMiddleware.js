"use strict";

const express = require("express");
const router = express.Router();

const Stats = require("../services/stats");
const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");
const {
  logIncomingMessage,
  logOutgoingMessage,
  markNeedsAgent,
} = require("../services/chatwoot");
const { enviarCorreoCita } = require("../services/email");
const { limpiarTexto } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const { esRespuestaSi, esRespuestaNo } = require("../utils/messages");
const {
  getSession,
  updateSession,
  resetSession,
  setReplyTarget,
} = require("../utils/sessions");
const { menuDiasDisponibles } = require("../utils/agenda");

const mensajesProcesados = new Map();

function normalizarTelefono(valor) {
  return String(valor || "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");
}

function claveContenido(from, text) {
  return `simple:${normalizarTelefono(from)}::${String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

function esDuplicado(from, text, { source = "unknown", messageId = null } = {}) {
  const now = Date.now();
  const id = messageId ? String(messageId) : null;

  if (id) {
    const keyId = `simple-id:${id}`;
    const anterior = mensajesProcesados.get(keyId);
    if (anterior && now - anterior.time < 60000) return true;
    mensajesProcesados.set(keyId, { time: now, source, messageId: id });
  }

  const key = claveContenido(from, text);
  const anterior = mensajesProcesados.get(key);

  if (anterior && now - anterior.time < 4000) {
    const diferenteFuente = anterior.source !== source;
    const faltaIdentificador = !id || !anterior.messageId;
    if (diferenteFuente || faltaIdentificador) return true;
  }

  mensajesProcesados.set(key, { time: now, source, messageId: id });

  for (const [guardada, data] of mensajesProcesados.entries()) {
    if (now - Number(data?.time || 0) > 120000) {
      mensajesProcesados.delete(guardada);
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

function extraerIncoming(req) {
  const path = req.path || "/";

  if (path === "/twilio") {
    const from = req.body?.From;
    const text = limpiarTexto(req.body?.Body || "");
    if (!from || !text) return null;

    return {
      from,
      text,
      source: "twilio",
      messageId: req.body?.MessageSid || req.body?.SmsMessageSid || null,
      skipIncomingNote: false,
    };
  }

  if (path === "/chatwoot") {
    const payload = req.body || {};
    const event = payload.event;
    const messageType = payload.message_type || payload.message?.message_type;
    const isPrivate = payload.private === true || payload.message?.private === true;

    if (isPrivate) return null;
    if (event && event !== "message_created") return null;
    if (messageType !== "incoming") return null;

    const content = payload.content || payload.message?.content || "";
    if (!String(content).trim()) return null;

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
      return null;
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

    if (!phone) return null;

    const from = phone.startsWith("whatsapp:")
      ? phone
      : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`;

    return {
      from,
      text: limpiarTexto(content),
      source: "chatwoot",
      messageId:
        payload.id ||
        payload.message?.id ||
        payload.message_id ||
        payload.content_attributes?.external_id ||
        null,
      skipIncomingNote: true,
    };
  }

  if (path === "/") {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    if (!message) return null;

    const from = message.from;
    const text = limpiarTexto(textoSeguroMeta(message));
    if (!from || !text) return null;

    return {
      from,
      text,
      source: "meta",
      messageId: message.id || null,
      skipIncomingNote: false,
    };
  }

  return null;
}

async function responderSimple(to, body) {
  const texto = String(body || "").trim();
  if (!texto) return;

  if (String(to).startsWith("whatsapp:")) {
    await sendTwilioText(to, texto);
  } else {
    await sendText(to, texto);
  }

  Stats.mensajeEnviado(to, texto.slice(0, 120));
  await logOutgoingMessage(to, texto);
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

También podemos ayudarte con otras opciones:

1️⃣ Primera vez
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

1️⃣ Precios y descuentos
2️⃣ Duración del proceso
3️⃣ Horarios de atención
4️⃣ Medios de pago
5️⃣ Proceso paso a paso
6️⃣ Ubicación
7️⃣ Volver al inicio`;
}

function esSolicitudAsesor(msg) {
  const texto = String(msg || "").toLowerCase().trim();
  return (
    texto === "asesor" ||
    texto.includes("hablar con asesor") ||
    texto.includes("hablar con un asesor") ||
    texto.includes("agente humano") ||
    texto.includes("hablar con alguien")
  );
}

function esComandoInicio(msg) {
  const texto = String(msg || "").toLowerCase().trim();
  return ["hola", "buenas", "menu", "menú", "inicio", "volver"].includes(texto);
}

function esRenovacionClara(msg) {
  const texto = String(msg || "").toLowerCase().trim();
  return [
    "quiero renovar",
    "necesito renovar",
    "deseo renovar",
    "quiero refrendar",
    "necesito refrendar",
    "renovacion",
    "renovación",
    "refrendacion",
    "refrendación",
  ].some((frase) => texto.includes(frase));
}

function esPrimeraVezClara(msg) {
  const texto = String(msg || "").toLowerCase().trim();
  return [
    "primera vez",
    "primera licencia",
    "sacar mi licencia",
    "sacar licencia",
    "nunca he tenido licencia",
  ].some((frase) => texto.includes(frase));
}

function esCorreccionCita(msg) {
  const texto = String(msg || "").toLowerCase().trim();
  return (
    texto === "2" ||
    texto.includes("corregir") ||
    texto.includes("editar") ||
    texto.includes("cambiar")
  );
}

function esConfirmacionCita(msg) {
  const texto = String(msg || "").toLowerCase().trim();
  return (
    texto === "1" ||
    esRespuestaSi(texto) ||
    texto.includes("confirmar") ||
    texto.includes("correcto")
  );
}

function limpiarDatosCita() {
  return {
    diaCita: null,
    fechaCitaISO: null,
    fechaSugeridaISO: null,
    horarioCita: null,
    nombreRunt: null,
    nombreCita: null,
    cedulaCita: null,
    telefonoCita: null,
    correoCita: null,
  };
}

function resumenCitaSimple(datos) {
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

async function transferirAAsesorSimple(from) {
  Stats.asesorActivado(from, "Usuario solicitó asesor desde flujo simplificado CRC");

  await markNeedsAgent(
    from,
    "Usuario solicitó asesor desde flujo simplificado CRC"
  ).catch((error) => {
    console.error("⚠️ No se pudo marcar conversación para asesor:", error.message);
  });

  updateSession(from, {
    step: "HUMANO",
    linea: "CRC",
    necesitaAsesor: true,
    asesorDisponible: true,
    asesorActivo: true,
    botPausadoPorAsesor: true,
    asesorLastAt: Date.now(),
    avisoReactivacionBotEnviado: false,
    consultaExternaDeshabilitada: null,
  });

  await responderSimple(
    from,
    `Perfecto ✅

Un asesor continuará con tu atención por este mismo chat.

Déjanos tu consulta y te responderemos en cuanto sea posible.`
  );
}

function debeManejar(session, text) {
  const msg = String(text || "").toLowerCase().trim();

  if (esComandoInicio(msg)) return true;

  if (["MENU_INICIAL", "MENU_PRINCIPAL"].includes(session.step)) {
    return !esSolicitudAsesor(msg);
  }

  if (
    [
      "RENOVACION_INTERES",
      "AGENDAR_RENOVACION",
      "NO_RENOVACION",
      "AGENDAR_PRIMERA_VEZ",
    ].includes(session.step)
  ) {
    return true;
  }

  if (session.step === "MENU_INFORMACION" && msg === "7") return true;
  if (session.step === "CONFIRMAR_CITA") return true;

  return false;
}

router.use(async (req, res, next) => {
  try {
    if (req.method !== "POST") return next();

    const incoming = extraerIncoming(req);
    if (!incoming) return next();

    const { from, text, source, messageId, skipIncomingNote } = incoming;
    const session = getSession(from);
    const msg = String(text || "").toLowerCase().trim();

    if (!debeManejar(session, text)) return next();

    if (esDuplicado(from, text, { source, messageId })) {
      if (!res.headersSent) res.status(200).send("OK");
      return;
    }

    if (!res.headersSent) res.status(200).send("OK");

    Stats.mensajeRecibido(from);
    setReplyTarget(from, from);

    if (!skipIncomingNote) {
      await logIncomingMessage(from, text).catch((error) => {
        console.error("⚠️ No se pudo registrar incoming de flujo simple en Chatwoot:", error.message);
      });
    }

    if (isRateLimited(from, session.step)) {
      Stats.rateLimitado(from);
      await responderSimple(
        from,
        "⚠️ Has enviado muchos mensajes seguidos.\nPor favor espera un momento."
      );
      return;
    }

    if (esComandoInicio(msg)) {
      resetSession(from);
      updateSession(from, {
        step: "RENOVACION_INTERES",
        linea: "CRC",
        replyTo: from,
        consultaExternaDeshabilitada: null,
      });
      await responderSimple(from, mensajePreguntaRenovacion());
      return;
    }

    if (["MENU_INICIAL", "MENU_PRINCIPAL"].includes(session.step)) {
      resetSession(from);
      updateSession(from, {
        step: "RENOVACION_INTERES",
        linea: "CRC",
        replyTo: from,
        consultaExternaDeshabilitada: null,
      });

      if (esRenovacionClara(msg)) {
        updateSession(from, {
          step: "AGENDAR_RENOVACION",
          tramite: "Renovación / Refrendación",
        });
        await responderSimple(from, mensajePromocionRenovacion());
        return;
      }

      if (esPrimeraVezClara(msg)) {
        updateSession(from, {
          step: "AGENDAR_PRIMERA_VEZ",
          tramite: "Primera vez",
        });
        await responderSimple(from, mensajePrimeraVez());
        return;
      }

      await responderSimple(from, mensajePreguntaRenovacion());
      return;
    }

    if (session.step === "RENOVACION_INTERES") {
      if (msg === "1" || esRespuestaSi(msg) || esRenovacionClara(msg)) {
        updateSession(from, {
          step: "AGENDAR_RENOVACION",
          tramite: "Renovación / Refrendación",
          consultaExternaDeshabilitada: null,
        });
        await responderSimple(from, mensajePromocionRenovacion());
        return;
      }

      if (msg === "2" || esRespuestaNo(msg) || esPrimeraVezClara(msg)) {
        updateSession(from, {
          step: "NO_RENOVACION",
          tramite: null,
          consultaExternaDeshabilitada: null,
        });
        await responderSimple(from, menuNoRenovacion());
        return;
      }

      await responderSimple(from, mensajePreguntaRenovacion());
      return;
    }

    if (session.step === "AGENDAR_RENOVACION") {
      if (msg === "1" || esRespuestaSi(msg) || msg.includes("agendar")) {
        updateSession(from, {
          step: "DIA_CITA",
          linea: "CRC",
          tramite: "Renovación / Refrendación",
          comparendos: "No consultado",
          cedula: null,
          documentoSimit: null,
          simitTienePendientes: false,
          consultaExternaDeshabilitada: null,
          ...limpiarDatosCita(),
        });
        await responderSimple(from, menuDiasDisponibles());
        return;
      }

      if (msg === "2" || esRespuestaNo(msg)) {
        updateSession(from, {
          step: "NO_RENOVACION",
          consultaExternaDeshabilitada: null,
        });
        await responderSimple(from, menuNoRenovacion());
        return;
      }

      await responderSimple(from, mensajePromocionRenovacion());
      return;
    }

    if (session.step === "NO_RENOVACION") {
      if (msg === "1" || esPrimeraVezClara(msg)) {
        updateSession(from, {
          step: "AGENDAR_PRIMERA_VEZ",
          tramite: "Primera vez",
          consultaExternaDeshabilitada: null,
        });
        await responderSimple(from, mensajePrimeraVez());
        return;
      }

      if (msg === "2" || msg.includes("informacion") || msg.includes("información")) {
        updateSession(from, {
          step: "MENU_INFORMACION",
          linea: "CRC",
          consultaExternaDeshabilitada: null,
        });
        await responderSimple(from, menuInformacion());
        return;
      }

      if (msg === "3" || esSolicitudAsesor(msg)) {
        await transferirAAsesorSimple(from);
        return;
      }

      await responderSimple(from, menuNoRenovacion());
      return;
    }

    if (session.step === "AGENDAR_PRIMERA_VEZ") {
      if (msg === "1" || esRespuestaSi(msg) || msg.includes("agendar")) {
        updateSession(from, {
          step: "DIA_CITA",
          linea: "CRC",
          tramite: "Primera vez",
          comparendos: "No aplica",
          cedula: null,
          documentoSimit: null,
          simitTienePendientes: false,
          consultaExternaDeshabilitada: null,
          ...limpiarDatosCita(),
        });
        await responderSimple(from, menuDiasDisponibles());
        return;
      }

      if (msg === "2" || esRespuestaNo(msg)) {
        updateSession(from, {
          step: "NO_RENOVACION",
          consultaExternaDeshabilitada: null,
        });
        await responderSimple(from, menuNoRenovacion());
        return;
      }

      await responderSimple(from, mensajePrimeraVez());
      return;
    }

    if (session.step === "MENU_INFORMACION" && msg === "7") {
      resetSession(from);
      updateSession(from, {
        step: "RENOVACION_INTERES",
        linea: "CRC",
        replyTo: from,
        consultaExternaDeshabilitada: null,
      });
      await responderSimple(from, mensajePreguntaRenovacion());
      return;
    }

    if (session.step === "CONFIRMAR_CITA") {
      if (esCorreccionCita(msg)) {
        updateSession(from, {
          step: "DIA_CITA",
          linea: "CRC",
          consultaExternaDeshabilitada: null,
          ...limpiarDatosCita(),
        });

        await responderSimple(
          from,
          `Sin problema ✅\n\nVamos a tomar los datos nuevamente.\n\n${menuDiasDisponibles()}`
        );
        return;
      }

      if (!esConfirmacionCita(msg)) {
        await responderSimple(
          from,
          `Por favor responde:\n\n1️⃣ Confirmar cita\n2️⃣ Corregir datos`
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

      updateSession(from, {
        step: "ENVIANDO_CORREO_CITA",
        consultaExternaDeshabilitada: null,
      });

      await responderSimple(
        from,
        "Estoy guardando tu solicitud y enviando la confirmación al correo ✅"
      );

      try {
        await enviarCorreoCita(datos);
        Stats.citaPreconfirmada(from, datos.nombre || "usuario");
        await responderSimple(from, resumenCitaSimple(datos));
      } catch (error) {
        console.error("❌ Error enviando correo en flujo simple:", error.message);

        await responderSimple(
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

📍 VIP CRC Galerías - Cra. 28A #51-70, Bogotá.

Un asesor continuará con la confirmación final.`
        );
      }

      resetSession(from);
      return;
    }

    return next();
  } catch (error) {
    console.error("❌ Error en flujo CRC simplificado:", error.message);

    if (!res.headersSent) {
      return next();
    }
  }
});

module.exports = router;
