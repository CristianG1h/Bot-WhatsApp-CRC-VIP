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

async function responder(to, body) {
  const texto = String(body || "");

  if (String(to).startsWith("whatsapp:")) {
    const partes = dividirMensaje(texto, 1300);

    for (const parte of partes) {
      await sendTwilioText(to, parte);
      await esperar(700);
    }

    return;
  }

  return sendText(to, texto);
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

  return (
    comparendos.length > 0 ||
    multas.length > 0 ||
    acuerdosPago.length > 0
  );
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

router.post("/twilio", async (req, res) => {
  res.status(200).send("OK");

  try {
    const from = req.body.From;
    const text = limpiarTexto(req.body.Body);

    if (!from || !text) return;

    await procesarMensaje(from, text);
  } catch (error) {
    console.error("❌ Error webhook Twilio:", error.message);
  }
});

async function procesarMensaje(from, text) {
  const session = getSession(from);
  const msg = text.toLowerCase().trim();

  console.log("Mensaje recibido:", text);
  console.log("Usuario:", from);
  console.log("➡️ Paso actual:", session.step);

  if (isRateLimited(from)) {
    await responder(
      from,
      "⚠️ Has enviado muchos mensajes seguidos.\nPor favor espera un momento."
    );
    return;
  }

  if (["hola", "buenas", "menu", "menú", "inicio", "volver"].includes(msg)) {
    resetSession(from);
    updateSession(from, { step: "MENU_INICIAL" });
    await responder(from, menuInicial());
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
      resetSession(from);
      await responder(
        from,
        `Perfecto ✅ Un asesor de *CIA VIP* continuará con tu atención.

Por favor déjanos:
Nombre completo
Ciudad
Consulta que deseas realizar`
      );
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
      resetSession(from);
      await responder(
        from,
        "Perfecto ✅ Un asesor de *VIP CRC Galerías* continuará con tu atención.\nPor favor déjanos tu nombre completo y el trámite que deseas realizar."
      );
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
  // TEMA 1: COMPARENDOS ANTES DE RUNT
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

      if (Array.isArray(respuestaSimit)) {
        for (const mensaje of respuestaSimit) {
          await responder(from, mensaje);
          await esperar(900);
        }
      } else {
        await responder(from, respuestaSimit);
      }

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
      await responder(
        from,
        `Perfecto ✅

Un asesor continuará con tu caso de comparendos.

Por favor déjanos estos datos:

👤 Nombre completo
🪪 Número de cédula
🏙️ Ciudad
📌 Consulta que deseas realizar`
      );

      resetSession(from);
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
      msg.includes("asesor")
    ) {
      await responder(
        from,
        `Perfecto ✅ Un asesor de *VIP CRC Galerías* continuará con tu atención.

Por favor déjanos:
Nombre completo
Día en el que deseas asistir o ser contactado
Trámite que deseas realizar`
      );

      resetSession(from);
      return;
    }

    if (msg === "2" || msg.includes("no") || msg.includes("menu")) {
      resetSession(from);
      updateSession(from, { step: "MENU_INICIAL" });
      await responder(from, menuInicial());
      return;
    }

    await responder(
      from,
      `¿Deseas continuar?

1️⃣ Hablar con asesor
2️⃣ Volver al menú principal`
    );
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
