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
    apiToken: String(apiToken).trim(),
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

function cacheKey(rawPhone) {
  const { inboxId } = getConfig();
  return `${inboxId}:${identifierFromPhone(rawPhone)}`;
}

async function chatwootRequest(path, options = {}) {
  const { baseUrl, apiToken } = getConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",

      // Header oficial de Chatwoot
      api_access_token: apiToken,

      // Header alternativo por si Nginx bloquea headers con "_"
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
    const error = new Error(
      `Chatwoot API ${response.status}: ${JSON.stringify(data)}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
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

function getArrayPayload(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.payload)) return response.payload;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getConversationInboxId(conversation) {
  return (
    conversation?.inbox_id ||
    conversation?.inbox?.id ||
    conversation?.meta?.inbox?.id ||
    conversation?.additional_attributes?.inbox_id ||
    null
  );
}

async function searchContactByPhone(rawPhone) {
  const { accountId } = getConfig();

  const phone = cleanPhone(rawPhone);
  const identifier = identifierFromPhone(rawPhone);

  const queries = [
    phone,
    identifier,
    phone.replace("+", ""),
  ];

  for (const query of queries) {
    try {
      const response = await chatwootRequest(
        `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(
          query
        )}`
      );

      const results = getArrayPayload(response);

      const found = results.find((item) => {
        const contact = item?.contact || item;

        const contactPhone = String(contact?.phone_number || "").replace(
          /\s+/g,
          ""
        );

        const contactIdentifier = String(contact?.identifier || "");

        return (
          contactPhone === phone ||
          contactPhone === phone.replace("+", "") ||
          contactIdentifier === identifier
        );
      });

      if (found) {
        const contact = found?.contact || found;

        if (contact?.id) {
          return contact.id;
        }
      }
    } catch (error) {
      console.error("⚠️ Error buscando contacto en Chatwoot:", error.message);
    }
  }

  return null;
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
      inbox_id: inboxId,
      ...(extra.additional_attributes || {}),
    },
    custom_attributes: {
      canal: "WhatsApp",
      origen: "Bot CRC Render",
      inbox_id: inboxId,
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
      `No se pudo obtener contact_id desde Chatwoot: ${JSON.stringify(
        response
      )}`
    );
  }

  return contactId;
}

async function getOrCreateContact(rawPhone, extra = {}) {
  const key = cacheKey(rawPhone);

  if (contactCache.has(key)) {
    return contactCache.get(key);
  }

  // 1. Primero buscar si el contacto ya existe.
  // Esto es importante porque Chatwoot no permite duplicar teléfono
  // dentro de la misma cuenta, aunque tengas varios inbox.
  const existingContactId = await searchContactByPhone(rawPhone);

  if (existingContactId) {
    contactCache.set(key, existingContactId);
    return existingContactId;
  }

  // 2. Si no existe, crearlo.
  try {
    const contactId = await createContact(rawPhone, extra);
    contactCache.set(key, contactId);
    return contactId;
  } catch (error) {
    console.error("⚠️ Error creando contacto en Chatwoot:", error.message);

    // 3. Si falló porque el teléfono ya existía, buscamos otra vez.
    if (
      error.status === 422 ||
      String(error.message || "").includes("Phone number has already been taken")
    ) {
      const contactId = await searchContactByPhone(rawPhone);

      if (contactId) {
        contactCache.set(key, contactId);
        return contactId;
      }
    }

    throw error;
  }
}

async function searchConversationBySource(rawPhone) {
  const { accountId, inboxId } = getConfig();
  const sourceId = `whatsapp:${cleanPhone(rawPhone)}`;

  try {
    const response = await chatwootRequest(
      `/api/v1/accounts/${accountId}/conversations?inbox_id=${inboxId}&status=open`
    );

    const conversations = getArrayPayload(response);

    const found = conversations.find((conversation) => {
      const conversationInboxId = getConversationInboxId(conversation);
      const conversationSourceId =
        conversation?.source_id ||
        conversation?.contact_inbox?.source_id ||
        conversation?.meta?.sender?.source_id ||
        "";

      return (
        Number(conversationInboxId) === Number(inboxId) &&
        String(conversationSourceId) === sourceId
      );
    });

    return found?.id || null;
  } catch (error) {
    console.error(
      "⚠️ Error buscando conversación por source_id en Chatwoot:",
      error.message
    );
    return null;
  }
}

async function searchOpenConversation(rawPhone, contactId) {
  const { accountId, inboxId } = getConfig();

  try {
    const response = await chatwootRequest(
      `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`
    );

    const conversations = getArrayPayload(response);

    if (!conversations.length) return null;

    // MUY IMPORTANTE:
    // Solo se usan conversaciones del inbox configurado.
    // Así evitamos mezclar CRC con Curso de Alimentos u otros canales.
    const conversationsFromThisInbox = conversations.filter((conversation) => {
      const conversationInboxId = getConversationInboxId(conversation);
      return Number(conversationInboxId) === Number(inboxId);
    });

    if (!conversationsFromThisInbox.length) return null;

    const openConversation =
      conversationsFromThisInbox.find(
        (conversation) => conversation.status === "open"
      ) || conversationsFromThisInbox[0];

    return openConversation?.id || null;
  } catch (error) {
    console.error("⚠️ Error buscando conversación en Chatwoot:", error.message);
    return null;
  }
}

async function createConversation(rawPhone, contactId) {
  const { accountId, inboxId } = getConfig();
  const sourceId = `whatsapp:${cleanPhone(rawPhone)}`;

  const body = {
    source_id: sourceId,
    inbox_id: inboxId,
    contact_id: contactId,
    status: "open",
    additional_attributes: {
      source: "twilio_whatsapp_render_bot",
      inbox_id: inboxId,
    },
    custom_attributes: {
      canal: "WhatsApp",
      origen: "Bot CRC Render",
      inbox_id: inboxId,
    },
  };

  const response = await chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations`,
    {
      method: "POST",
      body,
    }
  );

  const conversationId = extractConversationId(response);

  if (!conversationId) {
    throw new Error(
      `No se pudo obtener conversation_id desde Chatwoot: ${JSON.stringify(
        response
      )}`
    );
  }

  return conversationId;
}

async function getOrCreateConversation(rawPhone, extra = {}) {
  const key = cacheKey(rawPhone);

  if (conversationCache.has(key)) {
    return conversationCache.get(key);
  }

  const contactId = await getOrCreateContact(rawPhone, extra);

  // 1. Buscar conversación abierta del contacto,
  // pero SOLO dentro del inbox correcto.
  const existingConversationId = await searchOpenConversation(
    rawPhone,
    contactId
  );

  if (existingConversationId) {
    conversationCache.set(key, existingConversationId);
    return existingConversationId;
  }

  // 2. Intentar buscar por source_id dentro del inbox.
  const sourceConversationId = await searchConversationBySource(rawPhone);

  if (sourceConversationId) {
    conversationCache.set(key, sourceConversationId);
    return sourceConversationId;
  }

  // 3. Si no hay conversación para este inbox, crear una nueva.
  try {
    const conversationId = await createConversation(rawPhone, contactId);
    conversationCache.set(key, conversationId);
    return conversationId;
  } catch (error) {
    console.error("⚠️ Error creando conversación en Chatwoot:", error.message);

    // Si Chatwoot responde duplicado o conflicto, intentamos buscar de nuevo.
    if (error.status === 422 || error.status === 409) {
      const retryConversationId =
        (await searchOpenConversation(rawPhone, contactId)) ||
        (await searchConversationBySource(rawPhone));

      if (retryConversationId) {
        conversationCache.set(key, retryConversationId);
        return retryConversationId;
      }
    }

    throw error;
  }
}

async function createMessage(
  rawPhone,
  content,
  messageType = "incoming",
  extra = {}
) {
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

    if (
      messageType === "incoming" &&
      String(error.message || "").includes("Incoming messages are only allowed")
    ) {
      return addPrivateNote(
        rawPhone,
        `📥 *Mensaje del cliente:*

${text}`,
        extra
      );
    }

    return null;
  }
}

async function logIncomingMessage(rawPhone, content, extra = {}) {
  const text = String(content || "").trim();

  if (!text) return null;

  /*
    En bandejas Twilio/WhatsApp de Chatwoot, la API no permite crear
    mensajes incoming públicos. Por eso se guarda como nota privada.
  */
  return addPrivateNote(
    rawPhone,
    `📥 *Mensaje del cliente:*

${text}`,
    extra
  );
}

async function logOutgoingMessage(rawPhone, content, extra = {}) {
  const text = String(content || "").trim();

  if (!text) return null;

  /*
    IMPORTANTE:
    En bandejas Twilio/WhatsApp de Chatwoot, un mensaje outgoing público
    se envía realmente al WhatsApp del cliente.

    Como Render ya envía el mensaje por Twilio, aquí lo guardamos solo como
    nota privada para evitar mensajes duplicados.
  */
  return addPrivateNote(
    rawPhone,
    `🤖 *Respuesta del bot:*

${text}`,
    extra
  );
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

async function markNeedsAgent(
  rawPhone,
  reason = "Usuario solicitó hablar con asesor"
) {
  await addPrivateNote(
    rawPhone,
    `🔔 *Transferencia a asesor*

Motivo: ${reason}`
  );

  return true;
}

function clearChatwootCache(rawPhone) {
  const key = cacheKey(rawPhone);
  contactCache.delete(key);
  conversationCache.delete(key);
}

module.exports = {
  logIncomingMessage,
  logOutgoingMessage,
  addPrivateNote,
  markNeedsAgent,
  clearChatwootCache,
};
