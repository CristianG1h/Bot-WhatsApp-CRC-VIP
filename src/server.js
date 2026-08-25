"use strict";

const express = require("express");
const path = require("path");

async function cargarMetaDesdeChatwoot() {
  if (
    String(process.env.WHATSAPP_TOKEN || "").trim() &&
    String(process.env.PHONE_NUMBER_ID || "").trim()
  ) {
    process.env.META_CONFIG_SOURCE = "render_env";
    console.log("🔐 WhatsApp Cloud API configurada desde variables de Render");
    return true;
  }

  const baseUrl = String(process.env.CHATWOOT_BASE_URL || "").replace(/\/$/, "");
  const accountId = String(process.env.CHATWOOT_ACCOUNT_ID || "").trim();
  const inboxId = String(process.env.CHATWOOT_INBOX_ID || "").trim();
  const apiToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();

  if (!baseUrl || !accountId || !inboxId || !apiToken) {
    console.warn(
      "⚠️ No hay credenciales directas de Meta ni configuración completa de Chatwoot para recuperarlas"
    );
    process.env.META_CONFIG_SOURCE = "none";
    return false;
  }

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/inboxes/${inboxId}`,
      {
        headers: {
          api_access_token: apiToken,
          "api-access-token": apiToken,
        },
      }
    );

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      throw new Error(`Chatwoot inbox ${response.status}: ${JSON.stringify(data)}`);
    }

    const provider = String(data.provider || "");
    const providerConfig = data.provider_config || {};
    const token = String(providerConfig.api_key || "").trim();
    const phoneNumberId = String(providerConfig.phone_number_id || "").trim();

    if (!token || !phoneNumberId) {
      console.warn(
        `⚠️ Chatwoot respondió el inbox (${provider || "proveedor desconocido"}), pero no expuso provider_config. ` +
          "El CHATWOOT_API_TOKEN debe pertenecer a un administrador para recuperar api_key y phone_number_id."
      );
      process.env.META_CONFIG_SOURCE = "chatwoot_no_provider_config";
      return false;
    }

    process.env.WHATSAPP_TOKEN = token;
    process.env.PHONE_NUMBER_ID = phoneNumberId;
    process.env.META_CONFIG_SOURCE = "chatwoot_provider_config";

    console.log(
      `🔐 WhatsApp Cloud API cargada desde Chatwoot (${provider || "whatsapp"}) sin exponer el token`
    );
    return true;
  } catch (error) {
    console.error("⚠️ No se pudieron recuperar credenciales Meta desde Chatwoot:", error.message);
    process.env.META_CONFIG_SOURCE = "chatwoot_error";
    return false;
  }
}

async function iniciar() {
  // Es importante hacer esto ANTES de requerir config/whatsapp.js porque ese
  // servicio lee WHATSAPP_TOKEN y PHONE_NUMBER_ID al cargar el módulo.
  await cargarMetaDesdeChatwoot();

  const { PORT } = require("./config");
  const { instalarMediaHooks } = require("./services/mediaHooks");

  instalarMediaHooks();

  const healthRoutes = require("./routes/health");
  const chatwootContext = require("./routes/chatwootContext");
  const fotoSedeMiddleware = require("./routes/fotoSedeMiddleware");
  const habilitacionMiddleware = require("./routes/habilitacionMiddleware");
  const aiFallback = require("./routes/aiFallback");
  const whatsappRoutes = require("./routes/whatsapp");
  const Stats = require("./services/stats");

  const app = express();

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));

  const dashboardPath = path.join(__dirname, "public", "dashboard.html");
  const publicPath = path.join(__dirname, "public");
  const mediaPath = path.join(__dirname, "assets");

  const PREVIEW_TITLE = "Bot CRC VIP";
  const PREVIEW_DESCRIPTION =
    "Dashboard y estadísticas del bot CRC VIP. Consulta actividad, citas y seguimiento en tiempo real.";
  const PREVIEW_URL = process.env.PUBLIC_URL || "https://bot-whatsapp-crc-vip.onrender.com/";
  const PREVIEW_IMAGE = "https://vip-mediconecta.app/tenant-logo.png";

  function isPreviewBot(req) {
    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    return (
      ua.includes("whatsapp") ||
      ua.includes("facebookexternalhit") ||
      ua.includes("facebot") ||
      ua.includes("twitterbot") ||
      ua.includes("telegrambot") ||
      ua.includes("linkedinbot") ||
      ua.includes("discordbot") ||
      ua.includes("slackbot")
    );
  }

  function renderPreviewHtml() {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${PREVIEW_TITLE}</title>
  <link rel="icon" type="image/png" href="${PREVIEW_IMAGE}" />
  <link rel="apple-touch-icon" href="${PREVIEW_IMAGE}" />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="VIP CRC Galerías" />
  <meta property="og:title" content="${PREVIEW_TITLE}" />
  <meta property="og:description" content="${PREVIEW_DESCRIPTION}" />
  <meta property="og:url" content="${PREVIEW_URL}" />
  <meta property="og:image" content="${PREVIEW_IMAGE}" />
  <meta property="og:image:secure_url" content="${PREVIEW_IMAGE}" />
  <meta property="og:image:type" content="image/png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${PREVIEW_TITLE}" />
  <meta name="twitter:description" content="${PREVIEW_DESCRIPTION}" />
  <meta name="twitter:image" content="${PREVIEW_IMAGE}" />
  <style>
    body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07111f;color:#f8fafc;display:grid;place-items:center;padding:24px}.card{max-width:620px;text-align:center;background:#18263b;border:1px solid rgba(96,165,250,.28);border-radius:28px;padding:34px;box-shadow:0 30px 80px rgba(0,0,0,.28)}img{width:82px;height:82px;object-fit:contain;margin-bottom:18px}h1{margin:0;font-size:34px;line-height:1.1}p{color:#9db7d8;font-size:17px;line-height:1.6}.note{margin-top:18px;color:#10b981;font-weight:800}
  </style>
</head>
<body><main class="card"><img src="${PREVIEW_IMAGE}" alt="VIP CRC" /><h1>${PREVIEW_TITLE}</h1><p>${PREVIEW_DESCRIPTION}</p><div class="note">Panel privado protegido</div></main></body>
</html>`;
  }

  function protegerDashboard(req, res, next) {
    const DASHBOARD_USER = process.env.DASHBOARD_USER;
    const DASHBOARD_PASS = process.env.DASHBOARD_PASS;

    if (!DASHBOARD_USER || !DASHBOARD_PASS) {
      console.warn("⚠️ DASHBOARD_USER o DASHBOARD_PASS no configurados");
      return res.status(503).send("Dashboard no configurado");
    }

    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard VIP"');
      return res.status(401).send("Autenticación requerida");
    }

    const base64Credentials = auth.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
    const separatorIndex = credentials.indexOf(":");

    if (separatorIndex === -1) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard VIP"');
      return res.status(401).send("Autenticación inválida");
    }

    const user = credentials.slice(0, separatorIndex);
    const pass = credentials.slice(separatorIndex + 1);

    if (user !== DASHBOARD_USER || pass !== DASHBOARD_PASS) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard VIP"');
      return res.status(401).send("Usuario o contraseña incorrectos");
    }

    return next();
  }

  app.use("/media", express.static(mediaPath, { maxAge: "7d" }));
  app.use("/public", protegerDashboard, express.static(publicPath));

  app.get(
    "/",
    (req, res, next) => {
      if (isPreviewBot(req)) {
        return res.status(200).type("html").send(renderPreviewHtml());
      }
      return protegerDashboard(req, res, next);
    },
    (req, res) => {
      res.sendFile(dashboardPath);
    }
  );

  app.get("/dashboard", protegerDashboard, (req, res) => {
    res.sendFile(dashboardPath);
  });

  app.get("/api/stats", protegerDashboard, async (req, res) => {
    try {
      const data = await Stats.getSnapshot(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error("❌ Error en /api/stats:", error);
      return res.status(500).json({ ok: false, error: "Error cargando estadísticas" });
    }
  });

  app.use("/", healthRoutes);
  app.use("/webhook", chatwootContext);

  // Detecta el Sí de renovación antes de que el flujo cambie de estado y envía
  // la foto directamente por WhatsApp Cloud API cuando está disponible.
  app.use("/webhook", fotoSedeMiddleware);

  app.use("/webhook", habilitacionMiddleware);
  app.use("/webhook", aiFallback);
  app.use("/webhook", whatsappRoutes);

  app.listen(PORT, () => {
    console.log(`✅ Bot CRC VIP activo en puerto ${PORT}`);
    console.log("📊 Dashboard protegido en / y /dashboard");
    console.log("🔎 API stats activa en /api/stats");
    console.log(`☁️ Meta config source: ${process.env.META_CONFIG_SOURCE || "unknown"}`);
    console.log("🖼️ Foto guía y botones configurados para WhatsApp Cloud API");
  });
}

iniciar().catch((error) => {
  console.error("❌ No fue posible iniciar Bot CRC VIP:", error);
  process.exit(1);
});
