"use strict";
function splitMessage(value, limit = 1500) {
  let rest = String(value || "").trim();
  const parts = [];
  while (rest.length > limit) {
    let end = rest.lastIndexOf("\n", limit);
    if (end < limit / 2) end = rest.lastIndexOf(" ", limit);
    if (end < limit / 2) end = limit;
    if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}
module.exports = { splitMessage };
