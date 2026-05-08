// src/services/chatwoot.js

const contactCache = new Map();
const conversationCache = new Map();

function chatwootEnabled() {
  return String(process.env.CHATWOOT_ENABLED || "").toLowerCase() === "true";
}

function getConfig() {
  const baseUrl = String(process.env.CHATWOOT_BASE_URL || "").replace(/\/$/, "");
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const inboxId = process.env.CHATWOOT_INBOX_ID;
  const apiToken = process.env.CHATWOOT_API_TOKEN;

  if (!baseUrl || !accountId || !inboxId || !apiToken) {
    throw new Error(
      "Faltan variables de Chatwoot: CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_INBOX_ID o CHATWOOT_API_TOKEN"
    );
  }

  return {
    baseUrl,
    accountId,
    inboxId: Number(inboxId),
    apiToken,
  };
}

function cleanPhone(rawPhone) {
  let phone = String(rawPhone || "").trim();

  phone = phone.replace("whatsapp:", "");
  phone = phone.replace(/\s+/g, "");

  if (!phone.startsWith("+")) {
    phone = `+${phone}`;
  }

  return phone;
}

function identifierFromPhone(rawPhone) {
  return cleanPhone(rawPhone).replace("+", "");
}

function defaultName(rawPhone) {
  return `WhatsApp ${cleanPhone(rawPhone)}`;
}

async function chatwootRequest(path, options = {}) {
  const { baseUrl, apiToken } = getConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
headers: {
  "Content-Type": "application/json",

  // Header oficial usado por Chatwoot
  api_access_token: apiToken,

  // Alternativa para instalaciones self-hosted detrás de Nginx
  "api-access-token": apiToken,

  ...(options.headers || {}),
},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `Chatwoot API ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

function extractContactId(response) {
  return (
    response?.payload?.contact?.id ||
    response?.payload?.id ||
    response?.contact?.id ||
    response?.id ||
    null
  );
}

function extractConversationId(response) {
  return (
    response?.id ||
    response?.payload?.id ||
    response?.conversation?.id ||
    response?.payload?.conversation?.id ||
    null
  );
}

async function createContact(rawPhone, extra = {}) {
  const { accountId, inboxId } = getConfig();

  const phone = cleanPhone(rawPhone);
  const identifier = identifierFromPhone(rawPhone);

  const body = {
    inbox_id: inboxId,
    name: extra.name || defaultName(rawPhone),
    phone_number: phone,
    identifier,
    additional_attributes: {
      source: "twilio_whatsapp_render_bot",
      wa_id: identifier,
      ...(extra.additional_attributes || {}),
    },
    custom_attributes: {
      canal: "WhatsApp",
      origen: "Bot CRC Render",
      ...(extra.custom_attributes || {}),
    },
  };

  const response = await chatwootRequest(
    `/api/v1/accounts/${accountId}/contacts`,
    {
      method: "POST",
      body,
    }
  );

  const contactId = extractContactId(response);

  if (!contactId) {
    throw new Error(
      `No se pudo obtener contact_id desde Chatwoot: ${JSON.stringify(response)}`
    );
  }

  return contactId;
}

async function getOrCreateContact(rawPhone, extra = {}) {
  const identifier = identifierFromPhone(rawPhone);

  if (contactCache.has(identifier)) {
    return contactCache.get(identifier);
  }

  try {
    const contactId = await createContact(rawPhone, extra);
    contactCache.set(identifier, contactId);
    return contactId;
  } catch (error) {
    console.error("⚠️ Error creando contacto en Chatwoot:", error.message);

    /*
      Si el contacto ya existe, Chatwoot puede responder error por duplicado.
      Para no romper el bot, intentamos reutilizar desde cache si existe.
      Si no existe en cache, lanzamos el error.
    */
    if (contactCache.has(identifier)) {
      return contactCache.get(identifier);
    }

    throw error;
  }
}

async function createConversation(rawPhone, contactId) {
  const { accountId, inboxId } = getConfig();
  const sourceId = `whatsapp:${cleanPhone(rawPhone)}`;

  const response = await chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations`,
    {
      method: "POST",
      body: {
        source_id: sourceId,
        inbox_id: inboxId,
        contact_id: contactId,
        status: "open",
        additional_attributes: {
          source: "twilio_whatsapp_render_bot",
        },
        custom_attributes: {
          canal: "WhatsApp",
          origen: "Bot CRC Render",
        },
      },
    }
  );

  const conversationId = extractConversationId(response);

  if (!conversationId) {
    throw new Error(
      `No se pudo obtener conversation_id desde Chatwoot: ${JSON.stringify(response)}`
    );
  }

  return conversationId;
}

async function getOrCreateConversation(rawPhone, extra = {}) {
  const identifier = identifierFromPhone(rawPhone);

  if (conversationCache.has(identifier)) {
    return conversationCache.get(identifier);
  }

  const contactId = await getOrCreateContact(rawPhone, extra);
  const conversationId = await createConversation(rawPhone, contactId);

  conversationCache.set(identifier, conversationId);

  return conversationId;
}

async function createMessage(rawPhone, content, messageType = "incoming", extra = {}) {
  if (!chatwootEnabled()) return null;

  const text = String(content || "").trim();

  if (!text) return null;

  try {
    const { accountId } = getConfig();
    const conversationId = await getOrCreateConversation(rawPhone, extra);

    const response = await chatwootRequest(
      `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: {
          content: text,
          message_type: messageType,
          content_type: "text",
          private: false,
          content_attributes: {},
        },
      }
    );

    return response;
  } catch (error) {
    console.error("⚠️ Error guardando mensaje en Chatwoot:", error.message);
    return null;
  }
}

async function logIncomingMessage(rawPhone, content, extra = {}) {
  return createMessage(rawPhone, content, "incoming", extra);
}

async function logOutgoingMessage(rawPhone, content, extra = {}) {
  return createMessage(rawPhone, content, "outgoing", extra);
}

async function addPrivateNote(rawPhone, content, extra = {}) {
  if (!chatwootEnabled()) return null;

  const text = String(content || "").trim();

  if (!text) return null;

  try {
    const { accountId } = getConfig();
    const conversationId = await getOrCreateConversation(rawPhone, extra);

    const response = await chatwootRequest(
      `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: {
          content: text,
          message_type: "outgoing",
          content_type: "text",
          private: true,
          content_attributes: {},
        },
      }
    );

    return response;
  } catch (error) {
    console.error("⚠️ Error creando nota privada en Chatwoot:", error.message);
    return null;
  }
}

async function markNeedsAgent(rawPhone, reason = "Usuario solicitó hablar con asesor") {
  await addPrivateNote(
    rawPhone,
    `🔔 *Transferencia a asesor*\n\nMotivo: ${reason}`
  );

  return true;
}

function clearChatwootCache(rawPhone) {
  const identifier = identifierFromPhone(rawPhone);
  contactCache.delete(identifier);
  conversationCache.delete(identifier);
}

module.exports = {
  logIncomingMessage,
  logOutgoingMessage,
  addPrivateNote,
  markNeedsAgent,
  clearChatwootCache,
};
