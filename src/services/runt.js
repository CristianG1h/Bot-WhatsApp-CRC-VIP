const fs = require("fs");
const path = require("path");
const axios = require("axios");
const Tesseract = require("tesseract.js");

const CACHE_FILE = path.join(process.cwd(), "cache-runt.json");
const DAILY_LIMIT_FILE = path.join(process.cwd(), "daily-limit.json");
const CAPTCHA_FILE = path.join(process.cwd(), "captcha.png");

const CONFIG = {
  cacheDias: 15,
  maxConsultasDia: 150,
  maxIntentosOCR: 3,
  delayMinMs: 8000,
  delayMaxMs: 20000,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function leerJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function guardarJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function diasEntre(fechaIso) {
  const antes = new Date(fechaIso);
  const ahora = new Date();
  return Math.floor((ahora - antes) / (1000 * 60 * 60 * 24));
}

function validarLimiteDiario() {
  const hoy = fechaHoy();
  const data = leerJson(DAILY_LIMIT_FILE, { fecha: hoy, consultas: 0 });

  if (data.fecha !== hoy) {
    guardarJson(DAILY_LIMIT_FILE, { fecha: hoy, consultas: 0 });
    return true;
  }

  if (data.consultas >= CONFIG.maxConsultasDia) {
    throw new Error(`Límite diario alcanzado: ${CONFIG.maxConsultasDia} consultas`);
  }

  return true;
}

function sumarConsultaDiaria() {
  const hoy = fechaHoy();
  const data = leerJson(DAILY_LIMIT_FILE, { fecha: hoy, consultas: 0 });

  if (data.fecha !== hoy) {
    guardarJson(DAILY_LIMIT_FILE, { fecha: hoy, consultas: 1 });
    return;
  }

  data.consultas += 1;
  guardarJson(DAILY_LIMIT_FILE, data);
}

function buscarCache(cedula) {
  const cache = leerJson(CACHE_FILE, {});
  const item = cache[cedula];

  if (!item) return null;

  const dias = diasEntre(item.fechaConsulta);

  if (dias <= CONFIG.cacheDias) {
    return item;
  }

  return null;
}

function guardarCache(cedula, resultado) {
  const cache = leerJson(CACHE_FILE, {});

  cache[cedula] = {
    fechaConsulta: new Date().toISOString(),
    resultado,
  };

  guardarJson(CACHE_FILE, cache);
}

function formatearFecha(fechaIso) {
  if (!fechaIso) return "—";

  const fecha = new Date(fechaIso);

  return fecha.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function generarCaptcha() {
  const url =
    "https://runtproapi.runt.gov.co/CYRConsultaCiudadanoMS/captcha/libre-captcha/generar";

  const res = await axios.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://portalpublico.runt.gov.co",
      Referer: "https://portalpublico.runt.gov.co/",
    },
    timeout: 20000,
  });

  const { id, imagen } = res.data;

  if (!id || !imagen) {
    throw new Error("No fue posible generar el captcha del RUNT.");
  }

  const base64 = imagen.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(CAPTCHA_FILE, base64, "base64");

  return { id };
}

async function leerCaptcha() {
  const result = await Tesseract.recognize(CAPTCHA_FILE, "eng", {
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  });

  return result.data.text.replace(/[^a-zA-Z0-9]/g, "").trim();
}

async function consultarAuthRunt(cedula, captcha, idLibreCaptcha) {
  const url = "https://runtproapi.runt.gov.co/CYRConsultaCiudadanoMS/auth";

  const payload = {
    tipoDocumento: "C",
    documento: cedula,
    captcha,
    idLibreCaptcha,
    noDocumento: cedula,
    reCaptcha: null,
    valueCaptchaEncripted: "",
  };

  const res = await axios.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: "https://portalpublico.runt.gov.co",
      Referer: "https://portalpublico.runt.gov.co/",
    },
    timeout: 20000,
  });

  return res.data;
}

async function consultarLicencias(token) {
  const url =
    "https://runtproapi.runt.gov.co/CYRConsultaCiudadanoMS/consulta-ciudadano/licencias";

  const res = await axios.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://portalpublico.runt.gov.co",
      Referer: "https://portalpublico.runt.gov.co/",
      "Auth-Token": `Bearer ${token}`,
      "X-Funcionalidad": "SHELL",
    },
    timeout: 20000,
  });

  return res.data;
}

async function consultarConReintentos(cedula) {
  for (let intento = 1; intento <= CONFIG.maxIntentosOCR; intento++) {
    console.log(`[RUNT] Intento ${intento}/${CONFIG.maxIntentosOCR}`);

    const captchaData = await generarCaptcha();

    const delay = randomMs(CONFIG.delayMinMs, CONFIG.delayMaxMs);
    console.log(`[RUNT] Esperando ${(delay / 1000).toFixed(1)} segundos...`);
    await sleep(delay);

    const captchaTexto = await leerCaptcha();
    console.log(`[RUNT] Captcha leído: ${captchaTexto}`);

    if (!captchaTexto || captchaTexto.length < 4) {
      console.log("[RUNT] OCR débil. Reintentando...");
      continue;
    }

    try {
      const auth = await consultarAuthRunt(cedula, captchaTexto, captchaData.id);

      if (auth?.error === true) {
        console.log("[RUNT] Captcha o consulta rechazada. Reintentando...");
        continue;
      }

      let licencias = [];

      if (auth?.token && auth?.tieneLicencias) {
        licencias = await consultarLicencias(auth.token);
      }

      return {
        auth,
        licencias,
      };
    } catch (error) {
      if (error.response) {
        console.log(`[RUNT] Error HTTP ${error.response.status}`);
      } else {
        console.log(`[RUNT] ${error.message}`);
      }
    }
  }

  throw new Error("No fue posible consultar RUNT después de varios intentos.");
}

function obtenerLicenciasActivas(licencias) {
  if (!Array.isArray(licencias)) return [];

  return licencias.filter((lic) => lic.estadoLicencia === "ACTIVA");
}

async function consultarRuntPorCedula(cedula) {
  validarLimiteDiario();

  const cache = buscarCache(cedula);

  if (cache) {
    return {
      desdeCache: true,
      data: cache.resultado,
    };
  }

  const resultado = await consultarConReintentos(cedula);

  sumarConsultaDiaria();
  guardarCache(cedula, resultado);

  return {
    desdeCache: false,
    data: resultado,
  };
}

function formatearResultadoWhatsApp(cedula, resultado) {
  const { auth, licencias } = resultado.data;

  let mensaje = `✅ *Consulta RUNT realizada*\n\n`;

  if (resultado.desdeCache) {
    mensaje += `ℹ️ Resultado tomado desde consulta reciente.\n\n`;
  }

  mensaje += `🪪 *Cédula:* ${cedula}\n`;
  mensaje += `👤 *Nombre:* ${auth?.nombres || ""} ${auth?.apellidos || ""}\n`;
  mensaje += `🚦 *Estado conductor:* ${auth?.estadoConductor || "—"}\n`;
  mensaje += `👥 *Estado persona:* ${auth?.estadoPersona || "—"}\n`;
  mensaje += `📄 *Tiene licencias:* ${auth?.tieneLicencias ? "Sí" : "No"}\n`;

  const activas = obtenerLicenciasActivas(licencias);

  if (activas.length === 0) {
    mensaje += `\n⚠️ No se encontraron licencias activas.`;
    return mensaje;
  }

  mensaje += `\n🚗 *Licencias activas:*\n`;

  for (const lic of activas) {
    mensaje += `\n✅ *Licencia:* ${lic.numeroLicencia || "—"}\n`;
    mensaje += `🏢 *Expide:* ${lic.otExpide || "—"}\n`;
    mensaje += `📌 *Estado:* ${lic.estadoLicencia || "—"}\n`;

    if (Array.isArray(lic.detalleLicencia)) {
      for (const det of lic.detalleLicencia) {
        mensaje += `\n🚘 *Categoría:* ${det.categoria || "—"}\n`;
        mensaje += `📅 *Vence:* ${formatearFecha(det.fechaVencimiento)}\n`;
      }
    }
  }

  return mensaje;
}

module.exports = {
  consultarRuntPorCedula,
  formatearResultadoWhatsApp,
};