const express = require("express");
const router = express.Router();

const { VERIFY_TOKEN } = require("../config");
const { sendText } = require("../services/whatsapp");
const { consultarRuntPorCedula, formatearResultadoWhatsApp } = require("../services/runt");
const { getSession, updateSession, resetSession } = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");

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

    if (!text) return;

    if (isRateLimited(from)) {
      await sendText(from, "⚠️ Has enviado muchos mensajes seguidos. Por favor espera un momento.");
      return;
    }

    await handleMessage(from, text);
  } catch (error) {
    console.error("❌ Error webhook:", error.message);
  }
});

async function handleMessage(from, text) {
  const session = getSession(from);
  const msg = text.toLowerCase();

  if (msg === "menu" || msg === "inicio" || msg === "hola") {
    resetSession(from);
    await sendText(from, menuInicial());
    return;
  }

  if (session.step === "MENU") {
    await sendText(from, menuInicial());
    updateSession(from, { step: "TRAMITE" });
    return;
  }

  if (session.step === "TRAMITE") {
    const opciones = {
      "1": "Renovación",
      "2": "Refrendación",
      "3": "Primera vez"
    };

    if (!opciones[text]) {
      await sendText(from, "Por favor responde con una opción válida:\n\n1️⃣ Renovación\n2️⃣ Refrendación\n3️⃣ Primera vez");
      return;
    }

    updateSession(from, {
      tramite: opciones[text],
      step: "COMPARENDO"
    });

    await sendText(from, "¿Tienes comparendos pendientes?\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro");
    return;
  }

  if (session.step === "COMPARENDO") {
    const opciones = {
      "1": "Sí",
      "2": "No",
      "3": "No estoy seguro"
    };

    if (!opciones[text]) {
      await sendText(from, "Por favor responde:\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro");
      return;
    }

    updateSession(from, {
      comparendos: opciones[text],
      step: "ASISTENCIA"
    });

    await sendText(from, "¿Puedes asistir hoy o mañana?\n\n1️⃣ Hoy\n2️⃣ Mañana\n3️⃣ Otro día");
    return;
  }

  if (session.step === "ASISTENCIA") {
    const opciones = {
      "1": "Hoy",
      "2": "Mañana",
      "3": "Otro día"
    };

    if (!opciones[text]) {
      await sendText(from, "Por favor responde:\n\n1️⃣ Hoy\n2️⃣ Mañana\n3️⃣ Otro día");
      return;
    }

    updateSession(from, {
      asistencia: opciones[text],
      step: "CEDULA"
    });

    await sendText(from, "Perfecto ✅\n\nPor favor envíame tu número de cédula para revisar la información en RUNT.");
    return;
  }

  if (session.step === "CEDULA") {
    if (!esCedulaValida(text)) {
      await sendText(from, "⚠️ Por favor envía solo el número de cédula, sin puntos ni espacios.");
      return;
    }

    await sendText(from, "🔎 Estoy consultando la información en RUNT. Esto puede tardar unos segundos...");

    try {
      const resultado = await consultarRuntPorCedula(text);
      const respuesta = formatearResultadoWhatsApp(text, resultado);

      await sendText(from, respuesta);

      await sendText(from, "✅ Gracias. Un asesor de VIP CRC Galerías podrá ayudarte a continuar con el proceso.");
      resetSession(from);
    } catch (error) {
      console.error("❌ Error RUNT:", error.message);
      await sendText(from, "⚠️ En este momento no fue posible consultar RUNT. Por favor intenta más tarde o escribe *asesor*.");
    }

    return;
  }

  await sendText(from, menuInicial());
}

function menuInicial() {
  return `Hola 👋 gracias por escribir a VIP CRC Galerías.

Para ayudarte más rápido, responde con el número de la opción:

1️⃣ Renovación
2️⃣ Refrendación
3️⃣ Primera vez

También puedes escribir *menu* para volver al inicio.`;
}

module.exports = router;