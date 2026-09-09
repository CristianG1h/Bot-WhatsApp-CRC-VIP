"use strict";
const crypto = require("node:crypto");
const twilio = require("twilio");
function equal(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}
function webhookAuth(req, res, next) {
  if (req.method !== "POST") return next();
  const strict = process.env.WEBHOOK_AUTH_MODE !== "compat";
  let configured = false;
  let valid = false;
  if (req.path === "/twilio") {
    const token = process.env.TWILIO_AUTH_TOKEN;
    const base = String(process.env.PUBLIC_URL || "").replace(/\/$/, "");
    configured = Boolean(token && base);
    valid = configured && twilio.validateRequest(token, req.get("x-twilio-signature") || "",
      base + req.originalUrl, req.body || {});
  } else if (req.path === "/chatwoot") {
    const token = process.env.CHATWOOT_WEBHOOK_TOKEN;
    configured = Boolean(token);
    valid = configured && equal(token, req.get("x-webhook-token") || req.query.token);
  } else if (req.path === "/") {
    const secret = process.env.WHATSAPP_APP_SECRET;
    configured = Boolean(secret && req.rawBody);
    if (configured) {
      const digest = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
      valid = equal("sha256=" + digest, req.get("x-hub-signature-256"));
    }
  } else return res.sendStatus(404);
  if (!configured && !strict) return next();
  if (!configured) return res.status(503).json({ error: "Autenticación del webhook sin configurar" });
  if (!valid) return res.sendStatus(403);
  return next();
}
module.exports = webhookAuth;
