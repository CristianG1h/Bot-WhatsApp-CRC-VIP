const express = require("express");
const router = express.Router();
const Stats = require("../services/stats");

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

const {
  getSession,
  updateSession,
  resetSession,
  getAllSessions,
  setReplyTarget,
} = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const {
  getMessage,
  detectarPreguntasRapidas,
  obtenerRespuestaPreguntaRapida,
  esRespuestaSi,
  esRespuestaNo,
} = require("../utils/messages");
const { enviarCorreoCita } = require("../services/email");
const { consultarIA, iaConfigurada } = require("../services/ai");
const {
  logIncomingMessage,
  logOutgoingMessage,
  markNeedsAgent,
} = require("../services/chatwoot");

const ASESOR_TIMEOUT_MS = 10 * 60 * 1000;
let asesorCheckerIniciado = false;

function marcarAsesorActivo(from) {
  updateSession(from, {
    step: "HUMANO",
    necesitaAsesor: true,
    asesorActivo: true,
    botPausadoPorAsesor: true,
    asesorLastAt: Date.now(),
    avisoReactivacionBotEnviado: false,
  });

  console.log("👤 Asesor tomó la conversación:", from);
}

function asesorSigueActivo(session) {
  if (!session?.botPausadoPorAsesor) return false;
  if (!session?.asesorLastAt) return false;

  return Date.now() - Number(session.asesorLastAt) < ASESOR_TIMEOUT_MS;
}

async function reactivarBotPorInactividad(from, session) {
  if (!session?.botPausadoPorAsesor) return;
  if (asesorSigueActivo(session)) return;
  if (session.avisoReactivacionBotEnviado) return;

  updateSession(from, {
    step: "MENU_PRINCIPAL",
    linea: "CRC",
    necesitaAsesor: false,
    asesorActivo: false,
    botPausadoPorAsesor: false,
    asesorLastAt: null,
    avisoReactivacionBotEnviado: true,
  });

  await responder(
    from,
    `Hola 👋

Como no hemos tenido actividad reciente del asesor, el asistente automático queda activo nuevamente para ayudarte.

${menuPrincipal()}`
  );

  console.log("🤖 Bot reactivado por inactividad del asesor:", from);
}

function iniciarVerificadorAsesor() {
  if (asesorCheckerIniciado) return;
  asesorCheckerIniciado = true;

  setInterval(async () => {
    try {
      if (typeof getAllSessions !== "function") return;

      const sesiones = getAllSessions();

      for (const [from, session] of sesiones) {
        if (!session?.botPausadoPorAsesor) continue;
        if (session?.avisoReactivacionBotEnviado) continue;

        await reactivarBotPorInactividad(from, session);
      }
    } catch (error) {
      console.error("❌ Error verificando inactividad de asesor:", error.message);
    }
  }, 60 * 1000);

  console.log("⏱️ Verificador de asesor iniciado");
}

iniciarVerificadorAsesor();

const processedIncomingMessages = new Map();

function normalizarTelefonoSesion(valor) {
  return String(valor || "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");
}

function normalizarCedula(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function esPasoInicioOMenu(step) {
  return ["MENU_INICIAL", "MENU_PRINCIPAL"].includes(step);
}

function obtenerKeyContenido(from, text) {
  return `contenido:${normalizarTelefonoSesion(from)}::${String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

function esMensajeDuplicado(from, text, options = {}) {
  const now = Date.now();
  const source = String(options.source || "unknown");
  const messageId = options.messageId ? String(options.messageId) : null;

  if (messageId) {
    const idKey = `id:${messageId}`;
    const lastId = processedIncomingMessages.get(idKey);

    if (lastId && now - lastId.time < 60000) {
      return true;
    }

    processedIncomingMessages.set(idKey, {
      time: now,
      source,
      messageId,
    });
  }

  const contentKey = obtenerKeyContenido(from, text);
  const lastContent = processedIncomingMessages.get(contentKey);

  if (lastContent && now - lastContent.time < 4000) {
    const diferenteFuente = lastContent.source !== source;
    const faltaIdentificador = !messageId || !lastContent.messageId;

    // Si llega el mismo contenido desde Meta y Chatwoot, se considera duplicado.
    // En la misma fuente permitimos respuestas iguales con IDs diferentes,
    // porque pueden corresponder a pasos consecutivos del formulario.
    if (diferenteFuente || faltaIdentificador) {
      return true;
    }
  }

  processedIncomingMessages.set(contentKey, {
    time: now,
    source,
    messageId,
  });

  for (const [key, data] of processedIncomingMessages.entries()) {
    if (now - Number(data?.time || 0) > 120000) {
      processedIncomingMessages.delete(key);
    }
  }

  return false;
}

function esIntencionCia(msg) {
  return (
    msg.includes("simit") ||
    msg.includes("comparendo") ||
    msg.includes("comparendos") ||
    msg.includes("multa") ||
    msg.includes("multas") ||
    msg.includes("curso comparendo") ||
    msg.includes("curso de comparendo")
  );
}

function esIntencionCrc(msg) {
  return (
    msg.includes("licencia") ||
    msg.includes("licencias") ||
    msg.includes("renovar") ||
    msg.includes("renovacion") ||
    msg.includes("renovación") ||
    msg.includes("refrendacion") ||
    msg.includes("refrendación") ||
    msg.includes("pase") ||
    msg.includes("conduccion") ||
    msg.includes("conducción") ||
    msg.includes("examen medico") ||
    msg.includes("examen médico") ||
    msg.includes("agendar") ||
    msg.includes("cita")
  );
}


function esIntencionRenovacionClara(msg) {
  return [
    "quiero renovar",
    "necesito renovar",
    "deseo renovar",
    "quiero refrendar",
    "necesito refrendar",
    "voy a renovar",
    "quiero hacer la renovacion",
    "quiero hacer la renovación",
  ].some((frase) => msg.includes(frase));
}

function esIntencionPrimeraVezClara(msg) {
  return [
    "quiero sacar mi licencia por primera vez",
    "quiero sacar licencia por primera vez",
    "es mi primera vez",
    "nunca he tenido licencia y quiero sacarla",
    "quiero mi primera licencia",
  ].some((frase) => msg.includes(frase));
}

function esIntencionAgendarClara(msg) {
  return [
    "quiero agendar",
    "necesito agendar",
    "quiero una cita",
    "quiero reservar",
    "quiero separar cita",
    "quiero preconfirmar",
  ].some((frase) => msg.includes(frase));
}

function esOpcionRenovacion(msg) {
  return (
    msg === "1" ||
    msg === "renovacion" ||
    msg === "renovación" ||
    msg === "refrendacion" ||
    msg === "refrendación" ||
    msg === "renovar" ||
    msg === "refrendar" ||
    msg.includes("renovar licencia") ||
    msg.includes("renovación de licencia") ||
    msg.includes("renovacion de licencia")
  );
}

function esOpcionPrimeraVez(msg) {
  return (
    msg === "2" ||
    msg === "primera vez" ||
    msg.includes("por primera vez") ||
    msg.includes("primera licencia") ||
    msg.includes("sacar licencia")
  );
}

function mensajePreguntaComparendos() {
  return `Antes de consultar RUNT, cuéntame:

¿Tienes comparendos o multas pendientes?

1️⃣ Sí
2️⃣ No
3️⃣ No estoy seguro`;
}

function mensajePreguntaAgendar() {
  return `¿Deseas que te ayudemos a dejar tu atención preconfirmada?

1️⃣ Sí, quiero agendar
2️⃣ No por ahora`;
}

function pareceDatoPersonal(textoOriginal) {
  const texto = String(textoOriginal || "").trim();
  const soloDigitos = texto.replace(/\D/g, "");
  const posiblesNumeros = texto.match(/(?:\d[\s.\-]?){7,12}/g) || [];

  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(texto)) return true;
  if (/^\d{5,12}$/.test(texto)) return true;
  if (posiblesNumeros.some((valor) => valor.replace(/\D/g, "").length >= 7)) {
    return true;
  }
  if (soloDigitos.length >= 7 && soloDigitos.length <= 12 && texto.length < 20) {
    return true;
  }

  return false;
}

function pareceConsultaLibre(textoOriginal) {
  const texto = String(textoOriginal || "").trim().toLowerCase();

  if (texto.length < 8) return false;

  const iniciosPregunta = [
    "que ", "qué ", "como ", "cómo ", "cuando ", "cuándo ",
    "cuanto ", "cuánto ", "donde ", "dónde ", "cual ", "cuál ",
    "quien ", "quién ",
    "quienes ", "quiénes ", "puedo ", "debo ", "tengo ",
    "necesito ", "quisiera saber", "me puedes explicar",
    "me puede explicar", "una pregunta",
  ];

  const temasCRC = [
    "licencia", "pase", "crc", "runt", "categoria", "categoría",
    "moto", "carro", "vehiculo", "vehículo", "renovar", "renovacion",
    "renovación", "refrendar", "examen", "certificado", "conducir",
    "conduccion", "conducción", "transito", "tránsito", "movilidad",
  ];

  return (
    texto.includes("?") ||
    iniciosPregunta.some((inicio) => texto.startsWith(inicio)) ||
    (texto.length >= 18 && temasCRC.some((tema) => texto.includes(tema))) ||
    texto.length >= 35
  );
}

function esPasoProtegidoDeIA(step) {
  return [
    "MENU_TRAMITE",
    "COMPARENDO",
    "CIA_AUTORIZACION",
    "CIA_DOCUMENTO",
    "CIA_FINAL",
    "CONSULTANDO_SIMIT",
    "COMPARENDO_SIMIT_DOCUMENTO",
    "CONSULTANDO_SIMIT_CRC",
    "SIMIT_DECISION_CRC",
    "CEDULA",
    "CONSULTANDO_RUNT",
    "RUNT_ACTIVA",
    "RUNT_SIN_LICENCIAS",
    "RUNT_REVISION_MANUAL",
    "AGENDAR",
    "DIA_CITA",
    "DIA_PERSONALIZADO",
    "HORARIO_CITA",
    "HORARIO_PERSONALIZADO",
    "CONFIRMAR_NOMBRE_RUNT",
    "NOMBRE_CITA",
    "CEDULA_CITA",
    "TELEFONO_CITA",
    "CORREO_CITA",
    "CONFIRMAR_CITA",
    "ENVIANDO_CORREO_CITA",
    "DATOS_CITA",
    "HUMANO",
  ].includes(step);
}

function entradaEsperadaDelFlujo(session, msg, text) {
  const step = session?.step || "MENU_INICIAL";

  if (["menu", "menú", "inicio", "volver", "hola", "buenas"].includes(msg)) {
    return true;
  }

  if (step === "MENU_PRINCIPAL") return ["1", "2", "3"].includes(msg);
  if (step === "MENU_TRAMITE") {
    return esOpcionRenovacion(msg) || esOpcionPrimeraVez(msg) || msg === "3";
  }
  if (step === "MENU_INFORMACION") return /^[1-7]$/.test(msg);
  if (step === "FAQ_CONTINUAR") return esRespuestaSi(msg) || esRespuestaNo(msg);

  if (step === "COMPARENDO") {
    return (
      ["1", "2", "3", "si", "sí", "no"].includes(msg) ||
      msg.includes("comparendo") ||
      msg.includes("no se") ||
      msg.includes("no sé")
    );
  }

  if (step === "CEDULA") return esCedulaValida(normalizarCedula(text));

  if (step === "CONFIRMAR_NOMBRE_RUNT") {
    return (
      esRespuestaSi(msg) ||
      esRespuestaNo(msg) ||
      msg.includes("correcto") ||
      msg.includes("corregir") ||
      msg.includes("cambiar")
    );
  }

  if (step === "AGENDAR") {
    return esRespuestaSi(msg) || esRespuestaNo(msg) || msg.includes("agendar");
  }

  if (step === "RUNT_ACTIVA") {
    return ["1", "2", "3"].includes(msg) || msg.includes("asesor") || msg.includes("agendar");
  }

  if (["RUNT_SIN_LICENCIAS", "RUNT_REVISION_MANUAL"].includes(step)) {
    return ["1", "2", "3"].includes(msg) || msg.includes("asesor") || msg.includes("agendar");
  }

  if (step === "DIA_CITA") return Boolean(detectarDia(msg));

  if (step === "HORARIO_CITA") {
    const fechaCita = session.fechaCitaISO
      ? new Date(`${session.fechaCitaISO}T12:00:00-05:00`)
      : null;
    return Boolean(detectarHorario(msg, fechaCita));
  }

  return false;
}

function esMensajeTrivialSinIA(msg) {
  const texto = String(msg || "").trim().toLowerCase();

  return [
    "ok",
    "okay",
    "oki",
    "vale",
    "listo",
    "perfecto",
    "gracias",
    "muchas gracias",
    "entiendo",
    "dale",
    "bueno",
    "👍",
    "👌",
  ].includes(texto);
}

function debeIntentarIA(session, msg, text) {
  if (!iaConfigurada()) return false;
  if (pareceDatoPersonal(text)) return false;
  if (esPasoProtegidoDeIA(session?.step)) return false;
  if (entradaEsperadaDelFlujo(session, msg, text)) return false;
  if (esMensajeTrivialSinIA(msg)) return false;

  // La IA solo interviene en consultas libres. Los datos de formularios,
  // opciones de menú y mensajes cortos se mantienen dentro del flujo normal.
  return pareceConsultaLibre(text);
}

async function manejarFallbackIA(from, text, msg, session) {
  if (!debeIntentarIA(session, msg, text)) {
    return false;
  }

  console.log("🧠 Intentando IA fallback (FAQ sin coincidencia):", {
    from,
    step: session.step,
    preview: String(text || "").replace(/\s+/g, " ").slice(0, 120),
  });

  const respuestaIA = await consultarIA({
    mensaje: text,
    session,
  });

  if (!respuestaIA?.respuesta) {
    return false;
  }

  console.log("🧠 IA fallback respondió:", {
    from,
    step: session.step,
    confianza: respuestaIA.confianza,
    tema: respuestaIA.tema,
  });

  await responder(from, respuestaIA.respuesta);

  const preguntaContinuacion = preguntaActualPorStep(session);

  if (preguntaContinuacion) {
    await responder(
      from,
      `Para continuar con el proceso donde íbamos:\n\n${preguntaContinuacion}`
    );
  }

  return true;
}

async function responder(to, body) {
  const texto = String(body || "");

  if (String(to).startsWith("whatsapp:")) {
    const partes = dividirMensaje(texto, 1300);
    for (const parte of partes) {
      await sendTwilioText(to, parte);
      Stats.mensajeEnviado(to, parte.slice(0, 120));
      await esperar(700);
    }
    await logOutgoingMessage(to, texto);
    return;
  }

  const resultado = await sendText(to, texto);
  Stats.mensajeEnviado(to, texto.slice(0, 120));
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

function ajustarRespuestaSimitConAcuerdos(respuesta, resultadoSimit) {
  const acuerdosPago = Array.isArray(resultadoSimit?.acuerdosPago)
    ? resultadoSimit.acuerdosPago
    : [];

  if (acuerdosPago.length === 0) return respuesta;

  const nota = `⚠️ Además, SIMIT reporta *${acuerdosPago.length} acuerdo(s) de pago*. Te recomendamos revisarlos antes de finalizar el trámite de la licencia.`;

  const ajustarTexto = (mensaje) => {
    const texto = String(mensaje || "");

    if (texto.includes("No registra comparendos ni multas pendientes")) {
      return texto.replace(
        /✅ No registra comparendos ni multas pendientes\.?/i,
        nota
      );
    }

    return `${texto}

${nota}`;
  };

  return Array.isArray(respuesta)
    ? respuesta.map(ajustarTexto)
    : ajustarTexto(respuesta);
}

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

function obtenerDetallesRuntParaFlujo(resultado) {
  const licencias = Array.isArray(resultado?.data?.licencias)
    ? resultado.data.licencias
    : [];

  let licenciasValidas = licencias.filter(
    (licencia) => String(licencia?.estadoLicencia || "").toUpperCase() === "ACTIVA"
  );

  if (licenciasValidas.length === 0) {
    licenciasValidas = licencias;
  }

  const detalles = [];

  for (const licencia of licenciasValidas) {
    if (!Array.isArray(licencia?.detalleLicencia)) continue;

    for (const detalle of licencia.detalleLicencia) {
      if (!detalle?.categoria) continue;
      detalles.push(detalle);
    }
  }

  return detalles;
}

function clasificarResultadoRunt(resultado) {
  const detalles = obtenerDetallesRuntParaFlujo(resultado);

  if (detalles.length === 0) {
    return "SIN_LICENCIAS";
  }

  const ahora = new Date();
  ahora.setHours(0, 0, 0, 0);

  let tieneFechaValida = false;
  let requiereRenovacion = false;

  for (const detalle of detalles) {
    if (!detalle?.fechaVencimiento) continue;

    const vence = new Date(detalle.fechaVencimiento);
    if (Number.isNaN(vence.getTime())) continue;

    tieneFechaValida = true;
    vence.setHours(0, 0, 0, 0);

    const diferenciaDias = Math.ceil(
      (vence.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diferenciaDias <= 30) {
      requiereRenovacion = true;
      break;
    }
  }

  if (requiereRenovacion) return "RENOVACION_RECOMENDADA";
  if (tieneFechaValida) return "ACTIVA";
  return "REVISION_MANUAL";
}

function quitarCierreComercialRunt(respuesta) {
  const texto = String(respuesta || "");
  const separador = "\n━━━━━━━━━━━━━━━━━━━━\n";
  const index = texto.indexOf(separador);

  return index === -1 ? texto : texto.slice(0, index).trim();
}

function agregarOpcionAgendarDeTodasFormas(respuesta) {
  const texto = String(respuesta || "");

  if (texto.includes("3️⃣ Agendar de todas maneras")) {
    return texto;
  }

  if (texto.includes("2️⃣ Volver al menú principal")) {
    return texto.replace(
      "2️⃣ Volver al menú principal",
      "2️⃣ Volver al menú principal\n3️⃣ Agendar de todas maneras"
    );
  }

  return `${texto}\n\n3️⃣ Agendar de todas maneras`;
}

function obtenerNombreCompletoRunt(resultado) {
  const auth = resultado?.data?.auth || {};
  const nombres = String(auth.nombres || "").trim();
  const apellidos = String(auth.apellidos || "").trim();

  return `${nombres} ${apellidos}`.replace(/\s+/g, " ").trim();
}

function mensajeConfirmarNombreRunt(nombre) {
  return `El nombre registrado en RUNT es:

👤 *${nombre}*

¿Este nombre es correcto para la cita?

1️⃣ Sí, es correcto
2️⃣ No, corregir nombre`;
}

async function continuarConNombreCita(from, session, mensajeBase = "") {
  const nombreRunt = String(session?.nombreRunt || "").trim();

  if (nombreRunt) {
    updateSession(from, {
      step: "CONFIRMAR_NOMBRE_RUNT",
    });

    const prefijo = String(mensajeBase || "").trim();
    await responder(
      from,
      prefijo
        ? `${prefijo}

${mensajeConfirmarNombreRunt(nombreRunt)}`
        : mensajeConfirmarNombreRunt(nombreRunt)
    );
    return;
  }

  updateSession(from, {
    step: "NOMBRE_CITA",
  });

  const prefijo = String(mensajeBase || "").trim();
  await responder(
    from,
    prefijo
      ? `${prefijo}

Ahora envíame tu *nombre completo*.`
      : "Ahora envíame tu *nombre completo*."
  );
}

async function consultarRuntYContinuar(from, cedulaOriginal) {
  const cedula = normalizarCedula(cedulaOriginal);

  if (!esCedulaValida(cedula)) {
    updateSession(from, { step: "CEDULA" });
    await responder(
      from,
      "⚠️ Por favor envía una cédula válida, solo números, sin puntos ni espacios."
    );
    return;
  }

  const sessionAntesConsulta = getSession(from);
  const tramiteOriginal = sessionAntesConsulta.tramite;

  updateSession(from, {
    step: "CONSULTANDO_RUNT",
    cedula,
  });

  await responder(
    from,
    "🔎 Estoy consultando la información en RUNT.\nEsto puede tardar unos segundos..."
  );

  try {
    const resultado = await consultarRuntPorCedula(cedula);
    Stats.runtConsultado(from, cedula, "ok");

    const clasificacion = clasificarResultadoRunt(resultado);
    const nombreRunt = obtenerNombreCompletoRunt(resultado);
    let respuesta = formatearResultadoWhatsApp(cedula, resultado);

    updateSession(from, {
      cedula,
      cedulaCita: cedula,
      nombreRunt: nombreRunt || null,
      nombreCita: null,
    });

    // Si la persona indicó primera vez, pero RUNT sí muestra licencias,
    // orientamos el flujo como renovación para no registrar un trámite incorrecto.
    const tieneLicencias = clasificacion !== "SIN_LICENCIAS";
    const tramiteAjustado =
      tramiteOriginal === "Primera vez" && tieneLicencias
        ? "Renovación / Refrendación"
        : tramiteOriginal;

    if (tramiteOriginal === "Primera vez" && tieneLicencias) {
      await responder(
        from,
        "ℹ️ RUNT muestra que ya tienes una licencia registrada. Por eso el trámite corresponde a renovación o refrendación."
      );
    }

    if (clasificacion === "ACTIVA") {
      respuesta = agregarOpcionAgendarDeTodasFormas(respuesta);
    }

    if (clasificacion === "REVISION_MANUAL") {
      respuesta = quitarCierreComercialRunt(respuesta);
    }

    await responder(from, respuesta);

    if (clasificacion === "ACTIVA") {
      updateSession(from, {
        step: "RUNT_ACTIVA",
        cedula,
        tramite: tramiteAjustado,
      });
      return;
    }

    if (clasificacion === "SIN_LICENCIAS" && tramiteAjustado !== "Primera vez") {
      updateSession(from, {
        step: "RUNT_SIN_LICENCIAS",
        cedula,
      });

      await responder(
        from,
        `No aparecen licencias registradas para esta cédula.

¿Qué deseas hacer?

1️⃣ Hablar con un asesor
2️⃣ Continuar como trámite de primera vez
3️⃣ Volver al menú principal`
      );
      return;
    }

    if (clasificacion === "REVISION_MANUAL") {
      updateSession(from, {
        step: "RUNT_REVISION_MANUAL",
        cedula,
        tramite: tramiteAjustado,
      });

      await responder(
        from,
        `No fue posible determinar automáticamente la fecha de vencimiento.

¿Qué deseas hacer?

1️⃣ Hablar con un asesor
2️⃣ Agendar de todas maneras
3️⃣ Volver al menú principal`
      );
      return;
    }

    updateSession(from, {
      step: "AGENDAR",
      cedula,
      tramite: tramiteAjustado,
    });

    if (!String(respuesta).toLowerCase().includes("deseas que te ayudemos a agendar")) {
      await responder(from, mensajePreguntaAgendar());
    }
  } catch (error) {
    console.error("❌ Error RUNT:", error.message);
    Stats.runtConsultado(from, cedula, "error");

    updateSession(from, {
      step: "CEDULA",
      cedula: null,
      cedulaCita: null,
      nombreRunt: null,
      nombreCita: null,
    });

    await responder(
      from,
      "⚠️ En este momento no fue posible consultar RUNT.\nPuedes intentarlo nuevamente o escribir *asesor*."
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

  festivos.push(sumarDias(pascua, -3));
  festivos.push(sumarDias(pascua, -2));
  festivos.push(siguienteLunes(sumarDias(pascua, 39)));
  festivos.push(siguienteLunes(sumarDias(pascua, 60)));
  festivos.push(siguienteLunes(sumarDias(pascua, 68)));

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
      { inicio: 9 * 60, fin: 11 * 60 + 30 },
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
Sábados: 7:00 a.m. a 11:30 a.m.
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
Sábados: 7:00 a.m. a 11:30 a.m.
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

  if (msg.includes("otro") || msg.includes("otra") || msg.includes("diferente")) {
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
  const inicio = 12 * 60;
  const fin = 19 * 60;

  return esLunesAViernes && minutos >= inicio && minutos < fin;
}

function textoHorarioAsesor() {
  return `🕛 *Horario de atención con asesor:*
Lunes a viernes de *12:00 p.m. a 7:00 p.m.*

Fuera de ese horario puedes dejar tu consulta y un asesor la revisará en el próximo turno disponible.`;
}

function esSolicitudAsesor(msg) {
  const texto = String(msg || "").trim().toLowerCase();

  return [
    "asesor",
    "hablar con asesor",
    "hablar con un asesor",
    "quiero un asesor",
    "necesito un asesor",
    "agente humano",
    "hablar con un agente",
    "hablar con alguien",
    "atencion humana",
    "atención humana",
    "quiero hablar con una persona",
  ].some((frase) => texto === frase || texto.includes(frase));
}

function esProcesoActivoParaFAQ(step) {
  return ![
    "MENU_INICIAL",
    "MENU_PRINCIPAL",
    "MENU_INFORMACION",
    "CIA_MENU",
    "CIA_FINAL",
    "HUMANO",
    "FAQ_CONTINUAR",
    "ENVIANDO_CORREO_CITA",
  ].includes(step);
}

function puedeEvaluarPreguntaRapida(step, text) {
  const pasosDeCaptura = [
    "MENU_TRAMITE",
    "COMPARENDO",
    "CIA_AUTORIZACION",
    "CIA_DOCUMENTO",
    "CONSULTANDO_SIMIT",
    "COMPARENDO_SIMIT_DOCUMENTO",
    "CONSULTANDO_SIMIT_CRC",
    "CEDULA",
    "CONSULTANDO_RUNT",
    "RUNT_ACTIVA",
    "RUNT_SIN_LICENCIAS",
    "RUNT_REVISION_MANUAL",
    "AGENDAR",
    "DIA_CITA",
    "DIA_PERSONALIZADO",
    "HORARIO_CITA",
    "HORARIO_PERSONALIZADO",
    "NOMBRE_CITA",
    "CEDULA_CITA",
    "TELEFONO_CITA",
    "CORREO_CITA",
    "CONFIRMAR_CITA",
    "ENVIANDO_CORREO_CITA",
  ];

  if (!pasosDeCaptura.includes(step)) return true;

  const texto = String(text || "").trim().toLowerCase();
  const iniciosPregunta = [
    "que ", "qué ", "como ", "cómo ", "cuando ", "cuándo ",
    "cuanto ", "cuánto ", "donde ", "dónde ", "cual ", "cuál ",
    "puedo ", "debo ", "por que ", "por qué ", "quisiera saber",
    "me puedes explicar", "me puede explicar", "una pregunta",
  ];

  return texto.includes("?") || iniciosPregunta.some((inicio) => texto.startsWith(inicio));
}

function preguntaActualPorStep(session) {
  switch (session.step) {
    case "MENU_INICIAL":
    case "MENU_PRINCIPAL":
      return menuPrincipal();

    case "MENU_INFORMACION":
      return menuInformacion();

    case "MENU_TRAMITE":
      return menuTramite();

    case "COMPARENDO":
      return mensajePreguntaComparendos();

    case "COMPARENDO_SIMIT_DOCUMENTO":
      return "Por favor envíame tu número de cédula sin puntos ni espacios para consultar SIMIT.";

    case "CONSULTANDO_SIMIT":
    case "CONSULTANDO_SIMIT_CRC":
      return "Estamos consultando SIMIT. Por favor espera unos segundos.";

    case "SIMIT_DECISION_CRC":
      return `¿Qué deseas hacer?

1️⃣ Hablar con un asesor para comparendos
2️⃣ Seguir con la consulta de renovación en RUNT`;

    case "CEDULA":
      return "Por favor envíame tu número de cédula sin puntos ni espacios.";

    case "AGENDAR":
      return mensajePreguntaAgendar();

    case "CONSULTANDO_RUNT":
      return "Estamos consultando RUNT. Por favor espera unos segundos.";

    case "RUNT_ACTIVA":
      return `Tus categorías aparecen activas y no próximas a vencer.

1️⃣ Hablar con asesor
2️⃣ Volver al menú principal
3️⃣ Agendar de todas maneras`;

    case "RUNT_SIN_LICENCIAS":
      return `No aparecen licencias registradas.

1️⃣ Hablar con un asesor
2️⃣ Continuar como trámite de primera vez
3️⃣ Volver al menú principal`;

    case "RUNT_REVISION_MANUAL":
      return `Necesitamos revisar manualmente el resultado.

1️⃣ Hablar con un asesor
2️⃣ Agendar de todas maneras
3️⃣ Volver al menú principal`;

    case "DIA_CITA":
      return menuDiasCita();

    case "DIA_PERSONALIZADO":
      return `Indícanos qué día deseas asistir.

Ejemplo:
*viernes 8 de mayo de 2026*
*lunes 11 de mayo de 2026*
*15 de mayo de 2026*
*la otra semana*`;

    case "HORARIO_CITA": {
      const fechaCita = session.fechaCitaISO
        ? new Date(`${session.fechaCitaISO}T12:00:00-05:00`)
        : null;

      if (fechaCita) return menuHorariosCita(fechaCita);

      return `Horarios disponibles habituales:

1️⃣ 7:00 a.m. a 9:00 a.m.
2️⃣ 9:00 a.m. a 11:00 a.m.
3️⃣ 11:00 a.m. a 1:00 p.m.
4️⃣ 1:00 p.m. a 3:30 p.m.
5️⃣ Otro horario`;
    }

    case "HORARIO_PERSONALIZADO":
      return `Indícanos el horario aproximado que prefieres.

Ejemplo:
*10:00 a.m.*
*Después de las 2:00 p.m.*
*En la mañana*`;

    case "CONFIRMAR_NOMBRE_RUNT":
      return session.nombreRunt
        ? mensajeConfirmarNombreRunt(session.nombreRunt)
        : "Ahora envíame tu *nombre completo*.";

    case "NOMBRE_CITA":
      return "Ahora envíame tu *nombre completo*.";

    case "CEDULA_CITA":
      return "Ahora envíame tu *número de cédula*, sin puntos ni espacios.";

    case "TELEFONO_CITA":
      return "Ahora envíame tu *número de teléfono de contacto*.";

    case "CORREO_CITA":
      return "Ahora envíame tu *correo electrónico* para enviarte la confirmación de la cita.";

    case "CONFIRMAR_CITA": {
      const datos = {
        nombre: session.nombreCita,
        cedula: session.cedulaCita || session.cedula,
        telefono: session.telefonoCita,
        correo: session.correoCita,
        dia: session.diaCita || "Día por confirmar",
        horario: session.horarioCita || "Horario por confirmar",
        tramite: session.tramite || "Licencia de conducción",
      };

      return `Por favor confirma que los datos estén correctos:

👤 Nombre: *${datos.nombre || ""}*
🪪 Cédula: *${datos.cedula || ""}*
📞 Teléfono: *${datos.telefono || ""}*
📧 Correo: ${datos.correo || ""}
🚗 Trámite: *${datos.tramite}*
📅 Día: *${datos.dia}*
⏰ Horario: *${datos.horario}*

1️⃣ Confirmar cita
2️⃣ Corregir datos`;
    }

    default:
      return menuPrincipal();
  }
}

async function manejarPreguntaRapida(from, msg, session) {
  const tipos = detectarPreguntasRapidas(msg).slice(0, 3);

  if (!tipos.length) {
    return false;
  }

  const respuestas = tipos
    .map((tipo) => obtenerRespuestaPreguntaRapida(tipo))
    .filter(Boolean);

  if (!respuestas.length) {
    return false;
  }

  await responder(from, respuestas.join("\n\n"));

  if (esProcesoActivoParaFAQ(session.step)) {
    await responder(
      from,
      `Para continuar con el proceso donde íbamos:\n\n${preguntaActualPorStep(session)}`
    );
    return true;
  }

  updateSession(from, {
    step: "MENU_PRINCIPAL",
    linea: "CRC",
  });

  await responder(from, menuPrincipal());
  return true;
}

async function transferirAAsesor(
  from,
  motivo = "Usuario solicitó hablar con asesor"
) {
  const asesorDisponible = esHorarioAsesorDisponible();
  Stats.asesorActivado(from, motivo);

  await markNeedsAgent(from, motivo).catch((error) => {
    console.error("⚠️ No se pudo marcar la conversación para asesor:", error.message);
  });

  updateSession(from, {
    step: "HUMANO",
    necesitaAsesor: true,
    asesorDisponible,
    botPausadoPorAsesor: true,
    asesorActivo: asesorDisponible,
    asesorLastAt: Date.now(),
    avisoReactivacionBotEnviado: false,
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
📧 Correo: ${datos.correo}
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

    console.log("📩 Mensaje recibido desde Twilio Fallback:", text);
    console.log("Usuario:", from);

    await procesarMensaje(from, text, {
      source: "twilio",
      skipChatwootIncomingLog: false,
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

    if (messageType === "outgoing") {
      const textoOutgoing = String(content || "").trim();

      if (
        textoOutgoing.includes("Respuesta del bot") ||
        textoOutgoing.includes("asistente automático queda activo nuevamente") ||
        textoOutgoing.includes("Como no hemos tenido actividad reciente del asesor")
      ) {
        console.log("⏭️ Outgoing ignorado porque parece mensaje automático del bot");
        return;
      }

      const contact = payload.conversation?.contact || payload.contact || {};

      const phone =
        contact.phone_number ||
        payload.conversation?.meta?.sender?.phone_number ||
        payload.conversation?.contact_inbox?.source_id ||
        payload.contact_inbox?.source_id ||
        "";

      if (!phone) {
        console.log("⚠️ Mensaje outgoing de Chatwoot sin teléfono");
        return;
      }

      const from = phone.startsWith("whatsapp:")
        ? phone
        : `whatsapp:${phone.startsWith("+") ? phone : `+${phone}`}`;

      marcarAsesorActivo(from);
      return;
    }

    if (messageType !== "incoming") return;
    if (!content || !String(content).trim()) return;

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

    const contact = payload.conversation?.contact || payload.contact || sender || {};

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

async function procesarMensaje(from, text, options = {}) {
  if (esMensajeDuplicado(from, text, options)) {
    console.log("⏭️ Mensaje duplicado ignorado:", {
      from,
      text,
      source: options.source || "unknown",
      messageId: options.messageId || null,
    });
    return;
  }

  Stats.mensajeRecibido(from);
  setReplyTarget(from, from);

  const session = getSession(from);
  const msg = text.toLowerCase().trim();

  console.log("Mensaje recibido:", text);
  console.log("Usuario:", from);
  console.log("Fuente:", options.source || "direct");
  console.log("➡️ Paso actual:", session.step);

  if (!options.skipChatwootIncomingLog) {
    await logIncomingMessage(from, text).catch((error) => {
      console.error("⚠️ No se pudo registrar incoming en Chatwoot:", error.message);
    });
  }

  if (session.botPausadoPorAsesor) {
    if (["menu", "menú", "inicio", "volver"].includes(msg)) {
      resetSession(from);
      updateSession(from, {
        step: "MENU_PRINCIPAL",
        linea: "CRC",
        necesitaAsesor: false,
        asesorActivo: false,
        botPausadoPorAsesor: false,
        asesorLastAt: null,
        avisoReactivacionBotEnviado: false,
      });
      await responder(from, menuPrincipal());
      return;
    }

    if (asesorSigueActivo(session)) {
      console.log("👤 Bot pausado porque el asesor está activo:", from);
      return;
    }

    await reactivarBotPorInactividad(from, session);
    return;
  }

  if (isRateLimited(from, session.step)) {
    Stats.rateLimitado(from);
    await responder(
      from,
      "⚠️ Has enviado muchos mensajes seguidos.\nPor favor espera un momento."
    );
    return;
  }

  if (session.step === "HUMANO") {
    if (["menu", "menú", "inicio", "volver"].includes(msg)) {
      resetSession(from);
      updateSession(from, {
        step: "MENU_PRINCIPAL",
        linea: "CRC",
        necesitaAsesor: false,
        asesorActivo: false,
        botPausadoPorAsesor: false,
        asesorLastAt: null,
        avisoReactivacionBotEnviado: false,
      });

      await responder(from, menuPrincipal());
      return;
    }

    if (session.botPausadoPorAsesor && !asesorSigueActivo(session)) {
      await reactivarBotPorInactividad(from, session);
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

    return;
  }

  if (esSolicitudAsesor(msg)) {
    await transferirAAsesor(from, "Usuario escribió palabra clave de asesor");
    return;
  }

  if (["hola", "buenas", "menu", "menú", "inicio", "volver"].includes(msg)) {
    resetSession(from);
    updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });
    await responder(from, menuPrincipal());
    return;
  }

  if (session.step === "FAQ_CONTINUAR") {
    const returnStep = session.faqReturnStep || "MENU_PRINCIPAL";

    if (esRespuestaSi(msg)) {
      updateSession(from, {
        step: returnStep,
        faqReturnStep: null,
        faqPreguntaRespondida: null,
      });

      const sessionActualizada = getSession(from);

      await responder(
        from,
        `Perfecto ✅ continuemos.

${preguntaActualPorStep(sessionActualizada)}`
      );

      return;
    }

    if (esRespuestaNo(msg)) {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC" });
      await responder(from, menuPrincipal());
      return;
    }

    await responder(
      from,
      `Por favor responde:

1️⃣ Sí, continuar
2️⃣ No, volver al menú`
    );

    return;
  }

  if (
    ["CONSULTANDO_RUNT", "CONSULTANDO_SIMIT", "CONSULTANDO_SIMIT_CRC"].includes(
      session.step
    )
  ) {
    await responder(from, preguntaActualPorStep(session));
    return;
  }

  // Las intenciones generales solo se aplican al iniciar la conversación.
  // De esta manera no interrumpen una consulta RUNT/SIMIT ni un formulario activo.
  if (esPasoInicioOMenu(session.step)) {
    if (esIntencionCia(msg)) {
      updateSession(from, { step: "CIA_MENU", linea: "CIA" });
      await responder(from, menuCia());
      return;
    }

    if (esIntencionRenovacionClara(msg)) {
      updateSession(from, {
        linea: "CRC",
        tramite: "Renovación / Refrendación",
        comparendos: "No preguntado",
        step: "COMPARENDO",
      });

      await responder(from, `Perfecto ✅\n\n${mensajePreguntaComparendos()}`);
      return;
    }

    if (esIntencionPrimeraVezClara(msg)) {
      updateSession(from, {
        linea: "CRC",
        tramite: "Primera vez",
        comparendos: "No aplica",
        step: "CEDULA",
      });

      await responder(
        from,
        `Perfecto ✅

Primero vamos a revisar tu información en RUNT para confirmar el trámite correspondiente.

Por favor envíame tu número de cédula sin puntos ni espacios.`
      );
      return;
    }

    if (esIntencionAgendarClara(msg)) {
      updateSession(from, {
        linea: "CRC",
        tramite: null,
        comparendos: null,
        step: "MENU_TRAMITE",
      });

      await responder(
        from,
        `Claro, con gusto te ayudamos a agendar ✅

Antes de elegir el día y el horario, debemos identificar el trámite y revisar tu información en RUNT.

${menuTramite()}`
      );
      return;
    }

    if (esIntencionCrc(msg)) {
      updateSession(from, { step: "MENU_TRAMITE", linea: "CRC" });
      await responder(from, menuTramite());
      return;
    }
  }

  if (
    puedeEvaluarPreguntaRapida(session.step, text) &&
    (await manejarPreguntaRapida(from, msg, session))
  ) {
    return;
  }

  if (session.step === "MENU_INICIAL") {
    resetSession(from);
    updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });
    await responder(from, menuPrincipal());
    return;
  }

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

    updateSession(from, {
      step: "CONSULTANDO_SIMIT",
      documentoSimit: documento,
    });

    await responder(
      from,
      "🔎 Estoy consultando SIMIT. Esto puede tardar unos segundos..."
    );

    try {
      const resultado = await consultarSimitPorDocumento(documento);
      Stats.simitConsultado(from, documento, "ok");

      const respuesta = ajustarRespuestaSimitConAcuerdos(
        formatearResultadoSimitWhatsApp(documento, resultado),
        resultado
      );

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
      Stats.simitConsultado(from, documento, "error");

      updateSession(from, {
        step: "CIA_DOCUMENTO",
        documentoSimit: null,
      });

      await responder(
        from,
        "⚠️ En este momento no fue posible consultar SIMIT.\nPuedes intentarlo nuevamente o escribir *asesor*."
      );
    }

    return;
  }

  if (session.step === "CIA_FINAL") {
    if (
      msg === "1" ||
      msg.includes("asesor") ||
      esRespuestaSi(msg)
    ) {
      await transferirAAsesor(
        from,
        "Usuario solicitó asesor desde flujo CIA / SIMIT"
      );
      return;
    }

    if (msg === "2" || msg.includes("volver") || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC" });
      await responder(from, menuPrincipal());
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
      await transferirAAsesor(
        from,
        "Usuario eligió hablar con asesor desde menú principal CRC"
      );
      return;
    }

    await responder(from, menuPrincipal());
    return;
  }

  if (session.step === "MENU_TRAMITE") {
    if (esOpcionRenovacion(msg)) {
      updateSession(from, {
        tramite: "Renovación / Refrendación",
        comparendos: "No preguntado",
        step: "COMPARENDO",
      });

      await responder(from, `Perfecto ✅

${mensajePreguntaComparendos()}`);
      return;
    }

    if (esOpcionPrimeraVez(msg)) {
      updateSession(from, {
        tramite: "Primera vez",
        comparendos: "No aplica",
        step: "CEDULA",
      });

      await responder(
        from,
        `Perfecto ✅

Primero vamos a revisar tu información en RUNT para confirmar el trámite correspondiente.

Por favor envíame tu número de cédula sin puntos ni espacios.`
      );
      return;
    }

    if (msg === "3") {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });
      await responder(from, menuPrincipal());
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
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC" });
      await responder(from, menuPrincipal());
      return;
    }

    await responder(from, menuInformacion());
    return;
  }

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
    const documento = normalizarCedula(text);

    if (!esCedulaValida(documento)) {
      await responder(
        from,
        "⚠️ Por favor envía una cédula válida, solo números, sin puntos ni espacios."
      );
      return;
    }

    updateSession(from, {
      step: "CONSULTANDO_SIMIT_CRC",
      cedula: documento,
      documentoSimit: documento,
    });

    await responder(
      from,
      "🔎 Estoy consultando SIMIT para validar si aparece algún comparendo o multa pendiente.\nEsto puede tardar unos segundos..."
    );

    try {
      const resultadoSimit = await consultarSimitPorDocumento(documento);
      Stats.simitConsultado(from, documento, "ok");

      const respuestaSimit = ajustarRespuestaSimitConAcuerdos(
        formatearResultadoSimitWhatsApp(documento, resultadoSimit),
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
      Stats.simitConsultado(from, documento, "error");

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
      await transferirAAsesor(
        from,
        "Usuario solicitó asesor por comparendos / SIMIT desde flujo CRC"
      );
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

  if (session.step === "RUNT_ACTIVA") {
    if (msg === "1" || msg.includes("asesor")) {
      await transferirAAsesor(
        from,
        "Usuario solicitó asesor porque su licencia aparece activa en RUNT"
      );
      return;
    }

    if (msg === "2" || msg.includes("volver") || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });
      await responder(from, menuPrincipal());
      return;
    }

    if (msg === "3" || msg.includes("agendar") || msg.includes("de todas maneras")) {
      updateSession(from, { step: "DIA_CITA" });
      await responder(from, menuDiasCita());
      return;
    }

    await responder(from, preguntaActualPorStep(session));
    return;
  }

  if (session.step === "RUNT_SIN_LICENCIAS") {
    if (msg === "1" || msg.includes("asesor")) {
      await transferirAAsesor(
        from,
        "RUNT no mostró licencias para una solicitud de renovación"
      );
      return;
    }

    if (
      msg === "2" ||
      msg.includes("primera vez") ||
      msg.includes("agendar") ||
      msg.includes("continuar")
    ) {
      updateSession(from, {
        step: "DIA_CITA",
        tramite: "Primera vez",
      });
      await responder(from, menuDiasCita());
      return;
    }

    if (msg === "3" || msg.includes("volver") || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });
      await responder(from, menuPrincipal());
      return;
    }

    await responder(from, preguntaActualPorStep(session));
    return;
  }

  if (session.step === "RUNT_REVISION_MANUAL") {
    if (msg === "1" || msg.includes("asesor")) {
      await transferirAAsesor(
        from,
        "RUNT no permitió determinar automáticamente la fecha de vencimiento"
      );
      return;
    }

    if (msg === "2" || msg.includes("agendar") || msg.includes("continuar")) {
      updateSession(from, { step: "DIA_CITA" });
      await responder(from, menuDiasCita());
      return;
    }

    if (msg === "3" || msg.includes("volver") || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });
      await responder(from, menuPrincipal());
      return;
    }

    await responder(from, preguntaActualPorStep(session));
    return;
  }

  if (session.step === "CEDULA") {
    const cedula = normalizarCedula(text);

    if (!esCedulaValida(cedula)) {
      await responder(
        from,
        "⚠️ Por favor envía una cédula válida, solo números. Puedes enviarla con o sin puntos."
      );
      return;
    }

    await consultarRuntYContinuar(from, cedula);
    return;
  }

  if (session.step === "AGENDAR") {
    if (
      msg === "1" ||
      esRespuestaSi(msg) ||
      msg.includes("agendar") ||
      msg.includes("quiero cita")
    ) {
      updateSession(from, {
        step: "DIA_CITA",
      });

      await responder(from, menuDiasCita());
      return;
    }

    if (msg === "2" || esRespuestaNo(msg) || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL", linea: "CRC", replyTo: from });

      await responder(
        from,
        `Entendido ✅

Cuando quieras retomar el proceso puedes escribir *menu*.

${menuPrincipal()}`
      );
      return;
    }

    await responder(from, mensajePreguntaAgendar());
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
Sábados: 7:00 a.m. a 11:30 a.m.
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

    await continuarConNombreCita(
      from,
      getSession(from),
      `Perfecto ✅

Día seleccionado:
📅 *${session.diaCita || "Día por confirmar"}*

Horario seleccionado:
⏰ *${horario}*`
    );
    return;
  }

  if (session.step === "HORARIO_PERSONALIZADO") {
    const horarioPersonalizado = text.trim();

    if (horarioPersonalizado.length < 4) {
      await responder(from, "Por favor indícanos un horario aproximado más claro.");
      return;
    }

    updateSession(from, {
      horarioCita: horarioPersonalizado,
    });

    await continuarConNombreCita(
      from,
      getSession(from),
      `Listo ✅

Horario solicitado:
⏰ *${horarioPersonalizado}*`
    );
    return;
  }

  if (session.step === "CONFIRMAR_NOMBRE_RUNT") {
    const nombreRunt = String(session.nombreRunt || "").trim();

    if (!nombreRunt) {
      updateSession(from, { step: "NOMBRE_CITA" });
      await responder(from, "Ahora envíame tu *nombre completo*.");
      return;
    }

    if (
      msg === "1" ||
      esRespuestaSi(msg) ||
      msg.includes("correcto") ||
      msg.includes("esta bien") ||
      msg.includes("está bien")
    ) {
      const cedulaConsultada = normalizarCedula(session.cedula);

      updateSession(from, {
        step: "TELEFONO_CITA",
        nombreCita: nombreRunt,
        cedulaCita: esCedulaValida(cedulaConsultada)
          ? cedulaConsultada
          : session.cedulaCita,
      });

      await responder(
        from,
        `Perfecto ✅

Usaremos el nombre registrado en RUNT:
👤 *${nombreRunt}*

También usaremos la cédula ya validada:
🪪 *${cedulaConsultada || session.cedulaCita || ""}*

Ahora envíame tu *número de teléfono de contacto*.`
      );
      return;
    }

    if (
      msg === "2" ||
      esRespuestaNo(msg) ||
      msg.includes("corregir") ||
      msg.includes("cambiar") ||
      msg.includes("editar")
    ) {
      updateSession(from, {
        step: "NOMBRE_CITA",
        nombreRunt: null,
        nombreCita: null,
      });

      await responder(
        from,
        `Sin problema ✅

Escribe tu *nombre completo* exactamente como deseas que aparezca en la cita.`
      );
      return;
    }

    await responder(from, mensajeConfirmarNombreRunt(nombreRunt));
    return;
  }

  if (session.step === "NOMBRE_CITA") {
    const nombre = text.trim().replace(/\s+/g, " ");

    if (nombre.length < 5 || !nombre.includes(" ") || /\d/.test(nombre)) {
      await responder(
        from,
        "Por favor envíame tu *nombre completo*, con nombre y apellido y sin números."
      );
      return;
    }

    const cedulaConsultada = normalizarCedula(session.cedula);

    if (esCedulaValida(cedulaConsultada)) {
      updateSession(from, {
        step: "TELEFONO_CITA",
        nombreCita: nombre,
        cedulaCita: cedulaConsultada,
      });

      await responder(
        from,
        `Gracias, *${nombre}* ✅

Usaremos la misma cédula que ya fue validada en RUNT: *${cedulaConsultada}*.

Ahora envíame tu *número de teléfono de contacto*.`
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

Ahora envíame tu *número de cédula*, con o sin puntos.`
    );
    return;
  }

  if (session.step === "CEDULA_CITA") {
    const cedula = normalizarCedula(text);

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
      await responder(from, "⚠️ Por favor envía un número de teléfono válido.");
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
📧 Correo: ${datos.correo}
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

    const confirmacionValida =
      msg === "1" ||
      msg.includes("confirmar") ||
      msg.includes("correcto") ||
      esRespuestaSi(msg);

    if (!confirmacionValida) {
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

  // La IA se evalúa al final, después de intentar todas las reglas y pasos
  // del flujo. Así nunca reemplaza una consulta RUNT/SIMIT ni un formulario.
  if (await manejarFallbackIA(from, text, msg, session)) {
    return;
  }

  Stats.mensajeNoReconocido(from, text);

  resetSession(from);
  updateSession(from, { step: "MENU_INICIAL" });
  await responder(from, menuInicial());
}

function menuInicial() {
  return menuPrincipal();
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
5️⃣ Proceso paso a paso
6️⃣ Ubicación
7️⃣ Volver al menú principal`;
}

function menuInformacionCorto() {
  return `¿Deseas consultar otra información?

1️⃣ Precios y descuentos
2️⃣ Duración del proceso
3️⃣ Horarios de atención
4️⃣ Medios de pago
5️⃣ Proceso paso a paso
6️⃣ Ubicación
7️⃣ Volver al menú principal`;
}

module.exports = router;
