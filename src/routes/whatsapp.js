const express = require("express");
const router = express.Router();

const { VERIFY_TOKEN } = require("../config");
const { sendText } = require("../services/whatsapp");
const { consultarRuntPorCedula, formatearResultadoWhatsApp } = require("../services/runt");
const { getSession, updateSession, resetSession } = require("../utils/sessions");
const { limpiarTexto, esCedulaValida } = require("../utils/validation");
const { isRateLimited } = require("../utils/rateLimit");
const { getMessage } = require("../utils/messages");

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

  if (["menu", "inicio", "hola", "buenas", "volver"].includes(msg)) {
    resetSession(from);
    updateSession(from, { step: "MENU_PRINCIPAL" });
    await sendText(from, menuPrincipal());
    return;
  }

  if (session.step === "MENU") {
    updateSession(from, { step: "MENU_PRINCIPAL" });
    await sendText(from, menuPrincipal());
    return;
  }

  if (session.step === "MENU_PRINCIPAL") {
    if (msg === "1") {
      updateSession(from, { step: "MENU_TRAMITE" });
      await sendText(from, menuTramite());
      return;
    }

    if (msg === "2") {
      updateSession(from, { step: "MENU_INFORMACION" });
      await sendText(from, menuInformacion());
      return;
    }

    if (msg === "3") {
      resetSession(from);
      await sendText(
        from,
        "Perfecto ✅ Un asesor de VIP CRC Galerías continuará con tu atención. Por favor déjanos tu nombre completo y el trámite que deseas realizar."
      );
      return;
    }

    await sendText(from, menuPrincipal());
    return;
  }

  if (session.step === "MENU_TRAMITE") {
    if (msg === "1") {
      updateSession(from, {
        tramite: "Renovación / Refrendación",
        step: "COMPARENDO"
      });

      await sendText(from, "¿Tienes comparendos pendientes?\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro");
      return;
    }

    if (msg === "2") {
      updateSession(from, {
        tramite: "Primera vez",
        step: "COMPARENDO"
      });

      await sendText(from, "¿Tienes comparendos pendientes?\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro");
      return;
    }

    if (msg === "3") {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL" });
      await sendText(from, menuPrincipal());
      return;
    }

    await sendText(from, menuTramite());
    return;
  }

  if (session.step === "MENU_INFORMACION") {
    if (msg === "1") {
      await sendText(from, getMessage("precios"));
      await sendText(from, menuInformacionCorto());
      return;
    }

    if (msg === "2") {
      await sendText(from, getMessage("duracion"));
      await sendText(from, menuInformacionCorto());
      return;
    }

    if (msg === "3") {
      await sendText(from, getMessage("horarios"));
      await sendText(from, menuInformacionCorto());
      return;
    }

    if (msg === "4") {
      await sendText(from, getMessage("pagos"));
      await sendText(from, menuInformacionCorto());
      return;
    }

    if (msg === "5") {
      await sendText(from, getMessage("proceso"));
      await sendText(from, menuInformacionCorto());
      return;
    }

    if (msg === "6") {
      await sendText(from, getMessage("ubicacion"));
      await sendText(from, menuInformacionCorto());
      return;
    }

    if (msg === "7") {
      resetSession(from);
      updateSession(from, { step: "MENU_PRINCIPAL" });
      await sendText(from, menuPrincipal());
      return;
    }

    await sendText(from, menuInformacion());
    return;
  }

  if (session.step === "COMPARENDO") {
    const opciones = {
      "1": "Sí",
      "2": "No",
      "3": "No estoy seguro"
    };

    if (!opciones[msg]) {
      await sendText(from, "Por favor responde:\n\n1️⃣ Sí\n2️⃣ No\n3️⃣ No estoy seguro");
      return;
    }

    updateSession(from, {
      comparendos: opciones[msg],
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

    if (!opciones[msg]) {
      await sendText(from, "Por favor responde:\n\n1️⃣ Hoy\n2️⃣ Mañana\n3️⃣ Otro día");
      return;
    }

    updateSession(from, {
      asistencia: opciones[msg],
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

      await sendText(
        from,
        "✅ Gracias. Un asesor de VIP CRC Galerías podrá ayudarte a continuar con el proceso."
      );

      resetSession(from);
    } catch (error) {
      console.error("❌ Error RUNT:", error.message);
      await sendText(
        from,
        "⚠️ En este momento no fue posible consultar RUNT. Por favor intenta más tarde o escribe *asesor*."
      );
    }

    return;
  }

  resetSession(from);
  updateSession(from, { step: "MENU_PRINCIPAL" });
  await sendText(from, menuPrincipal());
}

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

module.exports = router;