"use strict";

const conversationCache = new Map();

function normalizarTelefono(rawPhone) {
  return String(rawPhone || "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9]/g, "");
}

function hasConfig() {
  return Boolean(
    String(process.env.CHATWOOT_BASE_URL || "").trim() &&
      String(process.env.CHATWOOT_ACCOUNT_ID || "").trim() &&
      String(process.env.CHATWOOT_API_TOKEN || "").trim()
  );
}

function rememberInteractiveConversation(rawPhone, conversationId) {
  const phone = normalizarTelefono(rawPhone);
  const id = Number(conversationId);
  if (!phone || !Number.isFinite(id) || id <= 0) return;
  conversationCache.set(phone, id);
}

function quitarFinal(mensaje, regex) {
  return String(mensaje || "").replace(regex, "").trim();
}

function construirMenu(mensaje) {
  const text = String(mensaje || "").trim();

  if (text.includes("¿Estás interesado(a) en *renovar tu licencia de conducción*?")) {
    return {
      content: quitarFinal(
        text,
        /\n\n1️⃣ Sí\n2️⃣ No\n\nResponde con el número de la opción\.?$/
      ),
      items: [
        { title: "Sí", value: "1" },
        { title: "No", value: "2" },
      ],
    };
  }

  if (
    text.includes("Renovación o refrendación: $180.000") &&
    text.includes("¿Deseas agendar tu cita?")
  ) {
    return {
      content: quitarFinal(text, /\n\n1️⃣ Sí\n2️⃣ No\s*$/),
      items: [
        { title: "Agendar", value: "1" },
        { title: "No", value: "2" },
      ],
    };
  }

  if (text.includes("También podemos ayudarte con:")) {
    return {
      content: quitarFinal(
        text,
        /\n\n1️⃣ Sacar la licencia por primera vez\n2️⃣ Información del proceso\n3️⃣ Hablar con asesor\n\nResponde con el número de la opción\.?$/
      ),
      items: [
        { title: "Primera vez", value: "1" },
        { title: "Información", value: "2" },
        { title: "Asesor", value: "3" },
      ],
    };
  }

  if (text.includes("¿Deseas agendar tu atención?")) {
    return {
      content: quitarFinal(text, /\n\n1️⃣ Sí\n2️⃣ No\s*$/),
      items: [
        { title: "Agendar", value: "1" },
        { title: "No", value: "2" },
      ],
    };
  }

  if (text.startsWith("Por favor confirma que los datos estén correctos:")) {
    return {
      content: quitarFinal(
        text,
        /\n\n1️⃣ Confirmar cita\n2️⃣ Corregir datos\s*$/
      ),
      items: [
        { title: "Confirmar cita", value: "1" },
        { title: "Corregir datos", value: "2" },
      ],
    };
  }

  if (
    text.includes("1️⃣ Confirmar cita") &&
    text.includes("2️⃣ Corregir datos")
  ) {
    return {
      content: "Por favor selecciona una opción:",
      items: [
        { title: "Confirmar cita", value: "1" },
        { title: "Corregir datos", value: "2" },
      ],
    };
  }

  return null;
}

async function trySendInteractive(rawPhone, mensaje) {
  if (!hasConfig()) return null;

  const menu = construirMenu(mensaje);
  if (!menu) return null;

  const phone = normalizarTelefono(rawPhone);
  const conversationId = conversationCache.get(phone);
  if (!conversationId) return null;

  const baseUrl = String(process.env.CHATWOOT_BASE_URL || "").replace(/\/$/, "");
  const accountId = String(process.env.CHATWOOT_ACCOUNT_ID || "").trim();
  const apiToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();

  const response = await fetch(
    `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: apiToken,
        "api-access-token": apiToken,
      },
      body: JSON.stringify({
        content: menu.content,
        message_type: "outgoing",
        private: false,
        content_type: "input_select",
        content_attributes: {
          items: menu.items,
          bot_crc_interactive: true,
        },
      }),
    }
  );

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(`Chatwoot interactivo ${response.status}: ${JSON.stringify(data)}`);
  }

  if (data?.status === "failed" || data?.external_error) {
    throw new Error(
      `Chatwoot creó el mensaje pero falló el canal: ${data.external_error || data.status}`
    );
  }

  console.log(
    "🔘 Menú interactivo enviado por Chatwoot:",
    phone,
    `#${conversationId}`,
    menu.items.map((item) => item.title).join(" | ")
  );

  return data;
}

module.exports = {
  rememberInteractiveConversation,
  trySendInteractive,
};
