"use strict";

const axios = require("axios");
const { GROQ_API_KEY, GROQ_MODEL } = require("../config");
const { construirPromptIA } = require("../utils/aiPrompt");
const { obtenerContextoParaIA } = require("../utils/messages");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";


function sanitizarMensajeParaIA(mensajeOriginal) {
  return String(mensajeOriginal || "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo omitido]")
    .replace(/(?:\d[\s.\-]?){7,12}/g, "[dato numérico omitido]")
    .slice(0, 1800);
}

function iaConfigurada() {
  return Boolean(String(GROQ_API_KEY || "").trim());
}

function limpiarRespuestaIA(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    const respuesta = String(parsed?.respuesta || "").trim();

    if (!respuesta) return null;

    return {
      respuesta,
      confianza: ["alta", "media", "baja"].includes(parsed?.confianza)
        ? parsed.confianza
        : "media",
      tema: ["crc", "fuera_de_tema", "requiere_asesor"].includes(parsed?.tema)
        ? parsed.tema
        : "crc",
    };
  } catch (error) {
    console.error("⚠️ Groq respondió contenido no JSON:", error.message);
    return null;
  }
}

async function consultarIA({ mensaje, session = {} }) {
  if (!iaConfigurada()) {
    console.warn("⚠️ GROQ_API_KEY no configurada. Se omite fallback de IA.");
    return null;
  }

  const systemPrompt = construirPromptIA({
    contextoCRC: obtenerContextoParaIA(),
    session,
  });

  try {
    const response = await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: sanitizarMensajeParaIA(mensaje),
          },
        ],
        temperature: 0.2,
        max_completion_tokens: 450,
        response_format: {
          type: "json_object",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return limpiarRespuestaIA(response.data);
  } catch (error) {
    const status = error?.response?.status;
    const detalle = error?.response?.data?.error?.message || error.message;

    console.error(
      `❌ Error consultando Groq${status ? ` (${status})` : ""}:`,
      detalle
    );

    return null;
  }
}

module.exports = {
  consultarIA,
  iaConfigurada,
};
