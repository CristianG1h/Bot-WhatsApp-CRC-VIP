"use strict";
const { phoneKey } = require("./incoming");
const hits = new Map();
const WINDOW_MS = 60000;
function isRateLimited(phone, step = "") {
  const now = Date.now();
  for (const [key, item] of hits) if (now - item.start >= WINDOW_MS) hits.delete(key);
  const key = phoneKey(phone);
  const entry = hits.get(key) || { start: now, count: 0 };
  entry.count++;
  hits.set(key, entry);
  const max = /CITA|HORARIO|DIA_|CORREGIR/.test(step) ? 45 : 20;
  return entry.count > max;
}
module.exports = { isRateLimited };
