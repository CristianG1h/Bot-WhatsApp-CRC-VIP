"use strict";

const { prepararMensajeSinConsultasExternas } = require("../utils/sessions");

const contactCache = new Map();
const conversationCache = new Map();
const pendingNotes = new Map();
let chatwootDisabledWarningShown = false;

const MAX_PENDING_NOTES = 30;
const PENDING_TTL_MS = 10 * 60 * 1000;

function hasChatwootConfig() {
  return Boolean(
    String(process.env.CHATWOOT_BASE_URL || "").trim() &&
      String(process.env.CHATWOOT_ACCOUNT_ID || "").trim() &&
      String(process.env.CHATWOOT_INBOX_ID || "").trim() &&
      String(process.env.CHATWOOT_API_TOKEN || "").trim()
  );
}

function chatwootEnabled() {
  // Para este bot la trazabilidad en Chatwoot es obligatoria cuando existen
  // las credenciales. Una variable CHATWOOT_ENABLED antigua en false no debe
  // apagar silenciosamente las notas privadas.
  return hasChatwootConfig();
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
  phone = phone.replace(/^whatsapp:/i, "");
  phone = phone.replace(/\s+/g, "");
  if (!phone.startsWith("+")) phone = `+${phone}`;
  return phone;
}

function identifierFromPhone(rawPhone) {
  return cleanPhone(rawPhone).replace("+", "");
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
      api_access_token: apiToken,
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
    const error = new Error(`Chatwoot API ${response.status}: ${JSON.stringify(data)}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function getArrayPayload(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.payload)) return response.payload;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.payload?.conversations)) return response.payload.conversations;
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
  const queries = [phone, identifier, phone.replace("+", "")];

  for (const query of queries) {
    try {
      const response = await chatwootRequest(
        `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(query)}`
      );
      const results = getArrayPayload(response);
      const found = results.find((item) => {
        const contact = item?.contact || item;
        const contactPhone = String(contact?.phone_number || "").replace(/\s+/g, "");
        const contactIdentifier = String(contact?.identifier || "");
        return (
          contactPhone === phone ||
          contactPhone === phone.replace("+", "") ||
          contactIdentifier === identifier
        );
      });

      if (found) {
        const contact = found?.contact || found;
        if (contact?.id) return contact.id;
      }
    } catch (error) {
      console.error("⚠️ Error buscando contacto en Chatwoot:", error.message);
    }
  }

  return null;
}

async function getContactId(rawPhone) {
  const key = cacheKey(rawPhone);
  if (contactCache.has(key)) return contactCache.get(key);
  const contactId = await searchContactByPhone(rawPhone);
  if (contactId) contactCache.set(key, contactId);
  return contactId;
}

async function searchOpenConversation(rawPhone) {
  const { accountId, inboxId } = getConfig();
  const contactId = await getContactId(rawPhone);
  if (!contactId) return null;

  try {
    const response = await chatwootRequest(
      `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`
    );
    const conversations = getArrayPayload(response).filter(
      (conversation) => Number(getConversationInboxId(conversation)) === Number(inboxId)
    );

    if (!conversations.length) return null;

    const open = conversations.filter((conversation) => conversation.status === "open");
    const candidates = open.length ? open : conversations;
    candidates.sort((a, b) => Number(b?.last_activity_at || b?.updated_at || b?.id || 0) - Number(a?.last_activity_at || a?.updated_at || a?.id || 0));
    return candidates[0]?.id || null;
  } catch (error) {
    console.error("⚠️ Error buscando conversación en Chatwoot:", error.message);
    return null;
  }
}

function queuePendingNote(rawPhone, text) {
  if (!hasChatwootConfig()) return;
  const key = cacheKey(rawPhone);
  const now = Date.now();
  const current = (pendingNotes.get(key) || []).filter(
    (item) => now - item.createdAt < PENDING_TTL_MS
  );
  current.push({ text, createdAt: now });
  pendingNotes.set(key, current.slice(-MAX_PENDING_NOTES));
  console.warn("🕓 Nota Chatwoot en espera de conversación real:", cleanPhone(rawPhone));
}

async function createPrivateNoteInConversation(conversationId, text) {
  const { accountId } = getConfig();
  return chatwootRequest(
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
}

async function flushPendingNotes(rawPhone, conversationId) {
  if (!conversationId || !hasChatwootConfig()) return;
  const key = cacheKey(rawPhone);
  const items = pendingNotes.get(key) || [];
  if (!items.length) return;

  pendingNotes.delete(key);
  const now = Date.now();
  for (const item of items) {
    if (now - item.createdAt >= PENDING_TTL_MS) continue;
    try {
      await createPrivateNoteInConversation(conversationId, item.text);
      console.log("📝 Nota pendiente registrada en Chatwoot:", cleanPhone(rawPhone));
    } catch (error) {
      console.error("⚠️ Error enviando nota pendiente a Chatwoot:", error.message);
      queuePendingNote(rawPhone, item.text);
      break;
    }
  }
}

async function rememberConversation(rawPhone, conversationId) {
  if (!hasChatwootConfig()) return null;
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const key = cacheKey(rawPhone);
  conversationCache.set(key, id);
  console.log("🔗 Conversación Chatwoot vinculada:", cleanPhone(rawPhone), `#${id}`);
  await flushPendingNotes(rawPhone, id);
  return id;
}

async function resolveConversation(rawPhone) {
  const key = cacheKey(rawPhone);
  if (conversationCache.has(key)) return conversationCache.get(key);

  const existingConversationId = await searchOpenConversation(rawPhone);
  if (existingConversationId) {
    conversationCache.set(key, existingConversationId);
    return existingConversationId;
  }

  return null;
}

function clearChatwootCache(rawPhone) {
  if (!hasChatwootConfig()) return;
  const key = cacheKey(rawPhone);
  contactCache.delete(key);
  conversationCache.delete(key);
}

async function addPrivateNote(rawPhone, content) {
  if (!chatwootEnabled()) {
    if (!chatwootDisabledWarningShown) {
      chatwootDisabledWarningShown = true;
      console.warn("⚠️ Notas privadas Chatwoot sin configuración completa");
    }
    return null;
  }

  const text = String(content || "").trim();
  if (!text) return null;

  let conversationId = await resolveConversation(rawPhone);
  if (!conversationId) {
    queuePendingNote(rawPhone, text);
    return null;
  }

  try {
    const result = await createPrivateNoteInConversation(conversationId, text);
    console.log("📝 Nota privada registrada en Chatwoot:", cleanPhone(rawPhone), `#${conversationId}`);
    return result;
  } catch (error) {
    console.error("⚠️ Error creando nota privada en Chatwoot:", error.message);
    clearChatwootCache(rawPhone);

    conversationId = await searchOpenConversation(rawPhone);
    if (conversationId) {
      conversationCache.set(cacheKey(rawPhone), conversationId);
      try {
        const result = await createPrivateNoteInConversation(conversationId, text);
        console.log("📝 Nota privada registrada en Chatwoot después de reintento:", cleanPhone(rawPhone), `#${conversationId}`);
        return result;
      } catch (retryError) {
        console.error("❌ No fue posible registrar la nota privada en Chatwoot:", retryError.message);
      }
    }

    queuePendingNote(rawPhone, text);
    return null;
  }
}

async function logIncomingMessage(rawPhone, content) {
  const text = String(content || "").trim();
  if (!text) return null;
  return addPrivateNote(rawPhone, `📥 *Mensaje del cliente:*\n\n${text}`);
}

async function logOutgoingMessage(rawPhone, content) {
  const original = String(content || "").trim();
  if (!original) return null;
  const text = prepararMensajeSinConsultasExternas(rawPhone, original);
  return addPrivateNote(rawPhone, `🤖 *Respuesta del bot:*\n\n${text}`);
}

async function markNeedsAgent(rawPhone, reason = "Usuario solicitó hablar con asesor") {
  return addPrivateNote(rawPhone, `🔔 *Transferencia a asesor*\n\nMotivo: ${reason}`);
}

function getChatwootNoteStatus() {
  let pending = 0;
  for (const items of pendingNotes.values()) pending += items.length;
  return {
    configured: hasChatwootConfig(),
    enabled: chatwootEnabled(),
    conversationsCached: conversationCache.size,
    pendingNotes: pending,
  };
}

module.exports = {
  logIncomingMessage,
  logOutgoingMessage,
  addPrivateNote,
  markNeedsAgent,
  clearChatwootCache,
  rememberConversation,
  getChatwootNoteStatus,
};
