"use strict";

const fs = require("fs");
const path = require("path");

const conversationCache = new Map();

function getConfig() {
  const baseUrl = String(process.env.CHATWOOT_BASE_URL || "").replace(/\/$/, "");
  const accountId = String(process.env.CHATWOOT_ACCOUNT_ID || "").trim();
  const inboxId = Number(process.env.CHATWOOT_INBOX_ID || 0);
  const apiToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();

  if (!baseUrl || !accountId || !inboxId || !apiToken) {
    throw new Error("Chatwoot no está configurado para adjuntos");
  }

  return { baseUrl, accountId, inboxId, apiToken };
}

function cleanPhone(rawPhone) {
  let phone = String(rawPhone || "").trim().replace(/^whatsapp:/i, "");
  phone = phone.replace(/\s+/g, "");
  if (!phone.startsWith("+")) phone = `+${phone.replace(/^\+/, "")}`;
  return phone;
}

function cacheKey(rawPhone) {
  const { inboxId } = getConfig();
  return `${inboxId}:${cleanPhone(rawPhone).replace(/\D/g, "")}`;
}

async function requestJson(url, options = {}) {
  const { apiToken } = getConfig();
  const response = await fetch(url, {
    ...options,
    headers: {
      api_access_token: apiToken,
      "api-access-token": apiToken,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Chatwoot API ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function arrayPayload(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.payload)) return response.payload;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.payload?.conversations)) return response.payload.conversations;
  return [];
}

function conversationInboxId(conversation) {
  return (
    conversation?.inbox_id ||
    conversation?.inbox?.id ||
    conversation?.meta?.inbox?.id ||
    conversation?.additional_attributes?.inbox_id ||
    null
  );
}

async function findConversation(rawPhone) {
  const key = cacheKey(rawPhone);
  if (conversationCache.has(key)) return conversationCache.get(key);

  const { baseUrl, accountId, inboxId } = getConfig();
  const phone = cleanPhone(rawPhone);
  const identifier = phone.replace(/\D/g, "");
  let contactId = null;

  for (const query of [phone, identifier]) {
    const data = await requestJson(
      `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(query)}`
    );
    const found = arrayPayload(data).find((item) => {
      const contact = item?.contact || item;
      const candidatePhone = String(contact?.phone_number || "").replace(/\s+/g, "");
      const candidateIdentifier = String(contact?.identifier || "").replace(/\D/g, "");
      return candidatePhone === phone || candidatePhone.replace(/\D/g, "") === identifier || candidateIdentifier === identifier;
    });
    const contact = found?.contact || found;
    if (contact?.id) {
      contactId = contact.id;
      break;
    }
  }

  if (!contactId) throw new Error(`No se encontró el contacto ${phone} en Chatwoot`);

  const conversationsData = await requestJson(
    `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`
  );
  const conversations = arrayPayload(conversationsData).filter(
    (conversation) => Number(conversationInboxId(conversation)) === Number(inboxId)
  );

  if (!conversations.length) throw new Error(`No se encontró conversación para ${phone}`);

  const open = conversations.filter((conversation) => conversation.status === "open");
  const candidates = open.length ? open : conversations;
  candidates.sort(
    (a, b) =>
      Number(b?.last_activity_at || b?.updated_at || b?.id || 0) -
      Number(a?.last_activity_at || a?.updated_at || a?.id || 0)
  );

  const conversationId = candidates[0]?.id;
  if (!conversationId) throw new Error(`Conversación inválida para ${phone}`);

  conversationCache.set(key, conversationId);
  return conversationId;
}

async function sendAttachment(rawPhone, filePath, options = {}) {
  const { baseUrl, accountId, apiToken } = getConfig();
  const conversationId = await findConversation(rawPhone);
  const absolutePath = path.resolve(filePath);
  const bytes = await fs.promises.readFile(absolutePath);
  const filename = options.filename || path.basename(absolutePath);
  const mimeType = options.mimeType || "application/octet-stream";
  const caption = String(options.caption || "").trim();

  const form = new FormData();
  if (caption) form.append("content", caption);
  form.append("message_type", "outgoing");
  form.append("private", "false");
  form.append("content_attributes[bot_crc_media]", "true");
  form.append("attachments[]", new Blob([bytes], { type: mimeType }), filename);

  const response = await fetch(
    `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        api_access_token: apiToken,
        "api-access-token": apiToken,
      },
      body: form,
    }
  );

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    conversationCache.delete(cacheKey(rawPhone));
    throw new Error(`Chatwoot adjunto ${response.status}: ${JSON.stringify(data)}`);
  }

  console.log("📎 Adjunto público enviado por Chatwoot:", cleanPhone(rawPhone), filename);
  return data;
}

module.exports = { sendAttachment };
