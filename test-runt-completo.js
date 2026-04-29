const fs = require("fs");
const axios = require("axios");
const Tesseract = require("tesseract.js");

const CEDULA = "1054541411"; // cambia por una cédula autorizada

const CACHE_FILE = "cache-runt.json";
const DAILY_LIMIT_FILE = "daily-limit.json";

const CONFIG = {
  cacheDias: 15,
  maxConsultasDia: 150,
  maxIntentosOCR: 3,
  delayMinMs: 8000,
  delayMaxMs: 20000,
};

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function log(msg) {
  console.log(msg);
}

function line(char = "─", len = 50) {
  return c.gray + char.repeat(len) + c.reset;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function leerJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function guardarJson(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
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
  const url = "https://runtproapi.runt.gov.co/CYRConsultaCiudadanoMS/captcha/libre-captcha/generar";

  const res = await axios.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://portalpublico.runt.gov.co",
      Referer: "https://portalpublico.runt.gov.co/",
    },
    timeout: 20000,
  });

  const { id, imagen } = res.data;

  const base64 = imagen.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync("captcha.png", base64, "base64");

  return { id };
}

async function leerCaptcha() {
  const result = await Tesseract.recognize("captcha.png", "eng", {
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  });

  return result.data.text.replace(/[^a-zA-Z0-9]/g, "").trim();
}

async function consultarRunt(cedula, captcha, idLibreCaptcha) {
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
  const url = "https://runtproapi.runt.gov.co/CYRConsultaCiudadanoMS/consulta-ciudadano/licencias";

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
    log(`\n${c.gray}[Intento ${intento}/${CONFIG.maxIntentosOCR}]${c.reset} Generando captcha...`);

    const captchaData = await generarCaptcha();

    const delay = randomMs(CONFIG.delayMinMs, CONFIG.delayMaxMs);
    log(`${c.dim}Esperando ${(delay / 1000).toFixed(1)} segundos antes de consultar...${c.reset}`);
    await sleep(delay);

    const captchaTexto = await leerCaptcha();
    log(`${c.dim}Captcha leído:${c.reset} ${c.cyan}${captchaTexto}${c.reset}`);

    if (!captchaTexto || captchaTexto.length < 4) {
      log(`${c.yellow}OCR débil. Reintentando...${c.reset}`);
      continue;
    }

    try {
      const auth = await consultarRunt(cedula, captchaTexto, captchaData.id);

      if (auth?.error === true) {
        log(`${c.yellow}Captcha o consulta rechazada. Reintentando...${c.reset}`);
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
        log(`${c.yellow}Error HTTP ${error.response.status}. Reintentando si aplica...${c.reset}`);
      } else {
        log(`${c.yellow}${error.message}${c.reset}`);
      }
    }
  }

  throw new Error("No fue posible consultar después de varios intentos.");
}

function obtenerLicenciasActivas(licencias) {
  if (!Array.isArray(licencias)) return [];

  return licencias.filter(lic => lic.estadoLicencia === "ACTIVA");
}

function imprimirResultado(cedula, data, desdeCache = false) {
  const { auth, licencias } = data;

  log("\n" + line("═"));
  log(`${c.green}${c.bold}✅ Consulta RUNT realizada${c.reset}`);
  log(line("═"));

  if (desdeCache) {
    log(`${c.yellow}Resultado tomado desde cache.${c.reset}`);
  }

  log(`\n${c.bold}Cédula:${c.reset} ${cedula}`);
  log(`${c.bold}Nombre:${c.reset} ${auth?.nombres || ""} ${auth?.apellidos || ""}`);
  log(`${c.bold}Estado conductor:${c.reset} ${auth?.estadoConductor || "—"}`);
  log(`${c.bold}Estado persona:${c.reset} ${auth?.estadoPersona || "—"}`);
  log(`${c.bold}Tiene licencias:${c.reset} ${auth?.tieneLicencias ? "Sí" : "No"}`);

  const activas = obtenerLicenciasActivas(licencias);

  if (activas.length === 0) {
    log(`\n${c.yellow}⚠️ No se encontraron licencias activas.${c.reset}`);
    log("\n" + line("═") + "\n");
    return;
  }

  log(`\n${line()}`);
  log(`${c.bold}🚗 Licencias activas:${c.reset}`);
  log(line());

  for (const lic of activas) {
    log(`\n✅ ${c.bold}Licencia:${c.reset} ${lic.numeroLicencia || "—"}`);
    log(`   ${c.dim}Expide:${c.reset} ${lic.otExpide || "—"}`);
    log(`   ${c.dim}Estado:${c.reset} ${lic.estadoLicencia || "—"}`);

    if (Array.isArray(lic.detalleLicencia)) {
      for (const det of lic.detalleLicencia) {
        log(`\n   🚘 ${c.bold}Categoría:${c.reset} ${c.cyan}${det.categoria || "—"}${c.reset}`);
        log(`      ${c.dim}Vence:${c.reset} ${formatearFecha(det.fechaVencimiento)}`);
      }
    }
  }

  log("\n" + line("═") + "\n");
}

async function main() {
  try {
    validarLimiteDiario();

    const cache = buscarCache(CEDULA);

    if (cache) {
      imprimirResultado(CEDULA, cache.resultado, true);
      return;
    }

    log(`${c.bold}Consultando RUNT para cédula:${c.reset} ${CEDULA}`);

    const resultado = await consultarConReintentos(CEDULA);

    sumarConsultaDiaria();
    guardarCache(CEDULA, resultado);

    imprimirResultado(CEDULA, resultado, false);
  } catch (error) {
    log(`\n${c.red}${c.bold}❌ Error:${c.reset} ${error.message}\n`);
  }
}

main();     