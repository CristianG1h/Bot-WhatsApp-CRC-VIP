"use strict";

const phoneKey = (value) => String(value || "").replace(/\D/g, "");
const text = (value) => typeof value === "string" ? value.trim().slice(0, 4000) : "";
const twilioPhone = (value) => "whatsapp:+" + phoneKey(value);

function chatwootEvent(payload) {
  const p = payload || {};
  if (p.event && p.event !== "message_created") return null;
  if ([true, "true"].includes(p.private ?? p.message?.private)) return null;
  const inbox = p.inbox?.id ?? p.inbox_id ?? p.conversation?.inbox_id ??
    p.conversation?.inbox?.id ?? p.message?.inbox_id ?? p.message?.inbox?.id ??
    p.conversation?.meta?.inbox?.id ?? p.conversation?.contact_inbox?.inbox_id ?? p.contact_inbox?.inbox_id;
  const account = p.account?.id ?? p.account_id ?? p.conversation?.account_id;
  if (process.env.CHATWOOT_INBOX_ID && String(inbox) !== String(process.env.CHATWOOT_INBOX_ID)) return null;
  if (process.env.CHATWOOT_ACCOUNT_ID && String(account) !== String(process.env.CHATWOOT_ACCOUNT_ID)) return null;
  const rawType = p.message_type ?? p.message?.message_type;
  const type = ({ 0: "incoming", 1: "outgoing" })[rawType] || rawType;
  const sender = p.sender || p.message?.sender || {};
  const contact = p.conversation?.meta?.sender || p.conversation?.contact || p.contact || {};
  const phone = contact.phone_number || (type === "incoming" ? sender.phone_number : "") ||
    p.conversation?.contact_inbox?.source_id || p.contact_inbox?.source_id;
  if (!/^\d{7,15}$/.test(phoneKey(phone))) return null;
  const senderType = String(sender.type || sender.sender_type || p.sender_type || p.message?.sender_type || "").toLowerCase();
  const attrs = p.content_attributes || p.message?.content_attributes || {};
  const human = type === "outgoing" && senderType === "user" && !attrs.bot_response && !p.agent_bot;
  if (type !== "incoming" && !human) return null;
  const hasMedia = Boolean((p.attachments || p.message?.attachments || []).length);
  return {
    from: twilioPhone(phone),
    text: text(attrs.button_reply?.id || attrs.list_reply?.id || attrs.submitted_values?.[0]?.value ||
      p.content || p.message?.content),
    media: hasMedia, source: "chatwoot",
    messageId: p.id ?? p.message?.id ?? p.message_id,
    externalId: p.source_id || p.message?.source_id || attrs.external_id,
    conversationId: p.conversation?.id ?? p.message?.conversation_id ?? p.conversation_id,
    skipChatwootIncomingLog: true, human,
  };
}

function extractIncoming(path, body = {}) {
  if (path === "/chatwoot") {
    const event = chatwootEvent(body);
    return event && (event.text || event.media || event.human) ? [event] : [];
  }
  if (path === "/twilio") {
    const from = phoneKey(body.From);
    if (!/^\d{7,15}$/.test(from)) return [];
    if (process.env.TWILIO_WHATSAPP_FROM && body.To &&
        phoneKey(body.To) !== phoneKey(process.env.TWILIO_WHATSAPP_FROM)) return [];
    const message = {
      from: twilioPhone(from), text: text(body.ButtonPayload || body.ListId || body.Body),
      media: Number(body.NumMedia) > 0, source: "twilio",
      messageId: body.MessageSid || body.SmsMessageSid,
    };
    return message.text || message.media ? [message] : [];
  }
  if (path !== "/") return [];
  const messages = [];
  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    if (process.env.PHONE_NUMBER_ID && String(value.metadata?.phone_number_id) !== process.env.PHONE_NUMBER_ID) continue;
    for (const m of value.messages || []) {
      if (!/^\d{7,15}$/.test(phoneKey(m.from))) continue;
      const content = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id ||
        m.button?.payload || m.text?.body || m.image?.caption || m.document?.caption || "";
      messages.push({
        from: phoneKey(m.from), text: text(content), media: !["text", "button", "interactive"].includes(m.type),
        source: "meta", messageId: m.id,
      });
    }
  }
  return messages;
}

module.exports = { extractIncoming, chatwootEvent, phoneKey };
