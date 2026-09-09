"use strict";
const { phoneKey } = require("./incoming");
const { createHash } = require("node:crypto");
const queues = new Map();
const seen = new Map();
const TTL = 24 * 60 * 60 * 1000;
const MAX_SEEN = 20000;

function isDuplicate(event, now = Date.now()) {
  for (const [key, value] of seen) if (now - value.time > TTL) seen.delete(key);
  const phone = phoneKey(event.from);
  const keys = [];
  if (event.messageId) keys.push("id:" + event.source + ":" + phone + ":" + event.messageId);
  const external = event.externalId || (event.source !== "chatwoot" ? event.messageId : null);
  if (external) keys.push("external:" + phone + ":" + external);
  if (keys.some((key) => seen.has(key))) return true;
  const digest = createHash("sha256").update(event.text || "[media]").digest("hex");
  const fingerprint = "text:" + phone + ":" + (event.human ? "human" : "client") + ":" + digest;
  const prev = seen.get(fingerprint);
  // Bridge two transports; allow separate intentional "1" replies.
  const duplicate = prev && now - prev.time < 5000 &&
    (prev.source !== event.source || !event.messageId);
  for (const key of keys) seen.set(key, { time: now, source: event.source });
  seen.set(fingerprint, { time: now, source: event.source });
  while (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
  return Boolean(duplicate);
}

function enqueue(phone, task) {
  const key = phoneKey(phone);
  const current = queues.get(key) || { pending: Promise.resolve(), count: 0 };
  if (current.count >= 30) return Promise.reject(new Error("Cola por contacto llena"));
  current.count++;
  const result = current.pending.catch(() => {}).then(task);
  current.pending = result;
  queues.set(key, current);
  return result.finally(() => {
    current.count--;
    if (!current.count) queues.delete(key);
  });
}
async function drain() {
  await Promise.allSettled([...queues.values()].map((item) => item.pending));
}
module.exports = { isDuplicate, enqueue, drain };
