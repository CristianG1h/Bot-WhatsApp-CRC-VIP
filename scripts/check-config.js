"use strict";
// Read-only local configuration check. Never prints secret values or calls APIs.
const channel = process.argv[2] || "chatwoot";
if (!["chatwoot", "twilio", "meta"].includes(channel)) {
  console.error("Uso: npm run doctor -- chatwoot|twilio|meta");
  process.exit(1);
}
const required = ["GOOGLE_SCRIPT_EMAIL_URL", "GOOGLE_SCRIPT_EMAIL_KEY", "DASHBOARD_USER", "DASHBOARD_PASS"];
if (channel !== "meta") required.push("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN");
if (channel === "chatwoot") required.push("CHATWOOT_BASE_URL", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_INBOX_ID", "CHATWOOT_API_TOKEN", "CHATWOOT_WEBHOOK_TOKEN");
if (channel === "twilio") required.push("PUBLIC_URL");
if (channel === "meta") required.push("WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "VERIFY_TOKEN", "META_API_VERSION");
let errors = 0;
function report(ok, label) {
  console.log((ok ? "OK: " : "FALTA/INVÁLIDO: ") + label);
  if (!ok) errors++;
}
for (const name of required) report(Boolean(String(process.env[name] || "").trim()), name);
if (channel !== "meta") {
  report(Boolean(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID), "TWILIO_WHATSAPP_FROM o TWILIO_MESSAGING_SERVICE_SID");
}
for (const name of ["PUBLIC_URL", "CHATWOOT_BASE_URL", "GOOGLE_SCRIPT_EMAIL_URL"]) {
  if (!process.env[name]) continue;
  let valid = false;
  try { const url = new URL(process.env[name]); valid = ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch {}
  report(valid, name + " (URL)");
}
if (process.env.DATABASE_URL) {
  let valid = false;
  try { valid = ["postgres:", "postgresql:"].includes(new URL(process.env.DATABASE_URL).protocol); } catch {}
  report(valid, "DATABASE_URL (formato)");
} else console.log("AVISO: estadísticas en memoria; no hay DATABASE_URL.");
if (channel === "chatwoot") report(process.env.CHATWOOT_ENABLED !== "false", "CHATWOOT_ENABLED");
report(!process.env.WEBHOOK_AUTH_MODE || process.env.WEBHOOK_AUTH_MODE === "strict", "WEBHOOK_AUTH_MODE=strict para producción");
report(!process.env.CRC_AGENDA_REMINDER_MINUTES || ["2", "3"].includes(process.env.CRC_AGENDA_REMINDER_MINUTES), "CRC_AGENDA_REMINDER_MINUTES=2 o 3");
for (const name of ["CRC_PRECIO_UNA_CATEGORIA", "CRC_PRECIO_DOS_CATEGORIAS"]) {
  if (process.env[name] !== undefined) report(Number.isFinite(Number(process.env[name])) && Number(process.env[name]) > 0, name);
}
if (!process.env.MAIL_TO_ADMIN) console.log("AVISO: MAIL_TO_ADMIN usa el destinatario predeterminado del proyecto; verifica que corresponda.");
if (!process.env.GROQ_API_KEY) console.log("INFO: IA opcional desactivada; se usa el catálogo local.");
console.log("Sesiones y recordatorios requieren una instancia activa. Este diagnóstico no verifica entrega real de mensajes ni correos.");
process.exitCode = errors ? 1 : 0;
