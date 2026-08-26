"use strict";

const express = require("express");
const path = require("path");

const { PORT } = require("./config");
const { instalarMediaHooks } = require("./services/mediaHooks");

// Los hooks deben instalarse antes de requerir las rutas para que estas tomen
// las funciones de envío ya adaptadas al canal correcto.
instalarMediaHooks();

const healthRoutes = require("./routes/health");
const chatwootContext = require("./routes/chatwootContext");
const habilitacionMiddleware = require("./routes/habilitacionMiddleware");
const aiFallback = require("./routes/aiFallback");
const whatsappRoutes = require("./routes/whatsapp");
const Stats = require("./services/stats");
const { getTwilioStatus } = require("./services/twilio");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

const dashboardPath = path.join(__dirname, "public", "dashboard.html");
const publicPath = path.join(__dirname, "public");
const mediaPath = path.join(__dirname, "assets");

const PREVIEW_TITLE = "Bot CRC VIP";
const PREVIEW_DESCRIPTION =
  "Dashboard y estadísticas del bot CRC VIP. Consulta actividad, citas y seguimiento en tiempo real.";
const PREVIEW_URL =
  process.env.PUBLIC_URL || "https://bot-whatsapp-crc-vip.onrender.com/";
const PREVIEW_IMAGE = "https://vip-mediconecta.app/tenant-logo.png";
const BASE_PUBLIC_URL = String(
  process.env.PUBLIC_URL || "https://bot-whatsapp-crc-vip.onrender.com"
).replace(/\/$/, "");
const SEDE_IMAGE_URL = `${BASE_PUBLIC_URL}/media/fachada.jpg`;
const SEDE_PAGE_URL = `${BASE_PUBLIC_URL}/sede-crc`;

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

// Endpoint específico para Twilio/WhatsApp. Devuelve un nombre corto y
// encabezados explícitos para que cualquier crawler pueda leer el JPEG.
app.get("/media/fachada.jpg", (req, res) => {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Disposition", 'inline; filename="fachada.jpg"');
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.sendFile(path.join(mediaPath, "fachada-crc-vip.jpg"));
});

// Página pública usada para la vista previa automática de enlaces en WhatsApp.
// Evita enviar la foto como adjunto, que este sender está rechazando con 63021.
app.get("/sede-crc", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIP CRC Galerías - Guía de ubicación</title>
  <meta name="description" content="Referencia visual para ubicar VIP CRC Galerías, Cra. 28A #51-70, Bogotá." />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="VIP CRC Galerías" />
  <meta property="og:title" content="VIP CRC Galerías - Guía de ubicación" />
  <meta property="og:description" content="Cra. 28A #51-70, barrio Galerías, Bogotá. Contamos con parqueadero." />
  <meta property="og:url" content="${SEDE_PAGE_URL}" />
  <meta property="og:image" content="${SEDE_IMAGE_URL}" />
  <meta property="og:image:secure_url" content="${SEDE_IMAGE_URL}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="520" />
  <meta property="og:image:height" content="375" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="VIP CRC Galerías - Guía de ubicación" />
  <meta name="twitter:description" content="Cra. 28A #51-70, barrio Galerías, Bogotá." />
  <meta name="twitter:image" content="${SEDE_IMAGE_URL}" />
  <style>
    body{margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033}.wrap{max-width:820px;margin:0 auto;padding:24px}.card{background:white;border-radius:20px;overflow:hidden;box-shadow:0 16px 50px rgba(0,0,0,.12)}img{display:block;width:100%;height:auto}.content{padding:24px}h1{margin:0 0 12px;font-size:28px}p{margin:8px 0;font-size:17px;line-height:1.5}.strong{font-weight:700}
  </style>
</head>
<body><div class="wrap"><main class="card"><img src="${SEDE_IMAGE_URL}" alt="Fachada VIP CRC Galerías" /><div class="content"><h1>VIP CRC Galerías</h1><p class="strong">Cra. 28A #51-70, barrio Galerías - Bogotá</p><p>Esta fotografía es una referencia visual para reconocer nuestra sede.</p><p>🚗 Contamos con parqueadero.</p></div></main></div></body>
</html>`);
});

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
app.use("/webhook", habilitacionMiddleware);
app.use("/webhook", aiFallback);
app.use("/webhook", whatsappRoutes);

app.listen(PORT, () => {
  const twilioStatus = getTwilioStatus();
  console.log(`✅ Bot CRC VIP activo en puerto ${PORT}`);
  console.log("📊 Dashboard protegido en / y /dashboard");
  console.log("🔎 API stats activa en /api/stats");
  console.log(
    `📞 Canal CRC: Twilio (${twilioStatus.configured ? "configurado" : "sin configurar"})`
  );
  console.log(
    "🔘 Menús: Twilio Content API (Quick Reply + List Picker) con texto como respaldo"
  );
  console.log("🖼️ Guía de sede: vista previa de enlace WhatsApp, sin adjunto ni plantilla");
});
