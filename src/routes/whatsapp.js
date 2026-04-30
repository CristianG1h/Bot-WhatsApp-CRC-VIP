const express = require("express");
const router = express.Router();

const { VERIFY_TOKEN } = require("../config");
const { sendText } = require("../services/whatsapp");
const { sendTwilioText } = require("../services/twilio");

const {
  consultarRuntPorCedula,
  formatearResultadoWhatsApp,
} = require("../services/runt");

const { getSession, updateSession, resetSession } = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const { getMessage } = require("../utils/messages");

/* =========================
   RESPONDER META O TWILIO
========================= */

async function responder(to, body) {
  if (String(to).startsWith("whatsapp:")) {
    return sendTwilioText(to, body);
  }

  return sendText(to, body);
}

/* =========================
   WEBHOOK META WHATSAPP
========================= */

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
    const text = limpiarTexto(message.text?.body);

    if (!from || !text) return;

    await procesarMensaje(from, text);
  } catch (error) {
    console.error("❌ Error webhook Meta:", error.message);
  }
});

/* =========================
   WEBHOOK TWILIO WHATSAPP
========================= */

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

/* =========================
   FLUJO PRINCIPAL DEL BOT
========================= */

async function procesarMensaje(from, text) {
  const session = getSession(from);
  const msg = text.toLowerCase().trim();

  console.log("📩 Mensaje recibido:", text);
  console.log("👤 Usuario:", from);
  console.log("➡️ Paso actual:", session.step);

  if (isRateLimited(from)) {
    await responder(
      from,
      "⚠️ Has enviado muchos mensajes seguidos. Por favor espera un momento."
    );
    return;
  }

  if (["hola", "buenas", "menu", "menú", "inicio", "volver"].includes(msg)) {
    resetSession(from);
    updateSession(from, { step: "MENU_PRINCIPAL" });
    await responder(from, menuPrincipal());
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
      resetSession(from);
      await responder(
        from,
        "Perfecto ✅ Un asesor de *VIP CRC Galerías* continuará con tu atención. Por favor déjanos tu nombre completo y el trámite que deseas realizar."
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
      updateSession(from, { step: "MENU_PRINCIPAL" });
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
      updateSession(from, { step: "MENU_PRINCIPAL" });
      await responder(from, menuPrincipal());
      return;
    }

    await responder(from, menuInformacion());
    return;
  }

  if (session.step === "COMPARENDO") {
    const opciones = {
      1: "Sí",
      2: "No",
      3: "No estoy seguro",
    };

    if (!opciones[msg]) {
      await responder(
        from,
        "Por favor responde:\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro"
      );
      return;
    }

    updateSession(from, {
      comparendos: opciones[msg],
      step: "ASISTENCIA",
    });

    await responder(
      from,
      "¿Puedes asistir hoy o mañana?\n\n1️⃣ Hoy\n2️⃣ Mañana\n3️⃣ Otro día"
    );
    return;
  }

  if (session.step === "ASISTENCIA") {
    const opciones = {
      1: "Hoy",
      2: "Mañana",
      3: "Otro día",
    };

    if (!opciones[msg]) {
      await responder(
        from,
        "Por favor responde:\n\n1️⃣ Hoy\n2️⃣ Mañana\n3️⃣ Otro día"
      );
      return;
    }

    updateSession(from, {
      asistencia: opciones[msg],
      step: "CEDULA",
    });

    await responder(
      from,
      "Perfecto ✅\n\nPor favor envíame tu número de cédula para revisar la información en RUNT."
    );
    return;
  }

  if (session.step === "CEDULA") {
    if (!esCedulaValida(text)) {
      await responder(
        from,
        "⚠️ Por favor envía solo el número de cédula, sin puntos ni espacios."
      );
      return;
    }

    await responder(
      from,
      "🔎 Estoy consultando la información en RUNT. Esto puede tardar unos segundos..."
    );

    try {
      const resultado = await consultarRuntPorCedula(text);
      const respuesta = formatearResultadoWhatsApp(text, resultado);

      await responder(from, respuesta);

      updateSession(from, {
        step: "AGENDAR",
        cedula: text,
      });
    } catch (error) {
      console.error("❌ Error RUNT:", error.message);

      await responder(
        from,
        "⚠️ En este momento no fue posible consultar RUNT. Por favor intenta más tarde o escribe *asesor*."
      );
    }

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
      `Perfecto ✅

Un asesor de *VIP CRC Galerías* continuará con tu atención.

Por favor déjanos:
👤 Nombre completo
📅 Día en el que deseas asistir o ser contactado
🚗 Trámite que deseas realizar`
    );

    resetSession(from);
    return;
  }

  if (msg === "2" || msg.includes("no") || msg.includes("menu")) {
    resetSession(from);
    updateSession(from, { step: "MENU_PRINCIPAL" });
    await responder(from, menuPrincipal());
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

/* =========================
   MENÚS
========================= */

function menuPrincipal() {
  return `Hola 👋 gracias por escribir a *VIP CRC Galerías*.

¿Cómo podemos ayudarte hoy?

1️⃣ Quiero sacar o renovar mi licencia
2️⃣ Quiero información del proceso
3️⃣ Hablar con asesor

También puedes escribir *menu* para volver al inicio.`;
}

function menuTramite() {
  return `Perfecto 🚗🏍️

¿Qué trámite deseas realizar?

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

    if (corte < 400) {
      corte = max;
    }

    partes.push(restante.slice(0, corte).trim());
    restante = restante.slice(corte).trim();
  }

  if (restante.length > 0) {
    partes.push(restante);
  }

  return partes;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = router;
