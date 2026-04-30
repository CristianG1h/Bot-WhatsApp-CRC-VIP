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

  const categorias = obtenerCategoriasLicencia(licencias);

  if (categorias.length === 0) {
    mensaje += `\n⚠️ No se encontraron categorías de licencia registradas.\n`;
    mensaje += `\n💬 Si deseas iniciar el proceso por primera vez, un asesor puede ayudarte con la información completa.`;
    return mensaje;
  }

  mensaje += `\n🚗 *Categorías principales encontradas:*\n`;

  for (const cat of categorias) {
    mensaje += `\n✅ *Categoría:* ${cat.categoria}\n`;
    mensaje += `📌 *Estado:* ${cat.estadoLicencia}\n`;
    mensaje += `📅 *Vence:* ${formatearFecha(cat.fechaVencimiento)}\n`;

    if (cat.estadoCalculado === "VENCIDA") {
      mensaje += `⚠️ Estado: *Vencida*\n`;
    } else if (cat.estadoCalculado === "PROXIMA") {
      mensaje += `⏳ Estado: *Próxima a vencer*\n`;
    } else {
      mensaje += `✅ Estado: *Activa*\n`;
    }
  }

  mensaje += generarOfertaSegunCategorias(categorias);

  return mensaje;
}

function obtenerCategoriasLicencia(licencias) {
  const categorias = [];

  if (!Array.isArray(licencias)) return categorias;

  for (const lic of licencias) {
    if (!Array.isArray(lic.detalleLicencia)) continue;

    for (const det of lic.detalleLicencia) {
      if (!det.categoria) continue;

      categorias.push({
        categoria: String(det.categoria).toUpperCase(),
        fechaVencimiento: det.fechaVencimiento,
        estadoLicencia: lic.estadoLicencia || "—",
        numeroLicencia: lic.numeroLicencia || "—",
        expide: lic.otExpide || "—",
        estadoCalculado: calcularEstadoVencimiento(det.fechaVencimiento),
      });
    }
  }

  return seleccionarCategoriasPrincipales(categorias);
}

function seleccionarCategoriasPrincipales(categorias) {
  const prioridad = {
    VENCIDA: 1,
    PROXIMA: 2,
    ACTIVA: 3,
    SIN_FECHA: 4,
  };

  const normalizadas = [];

  for (const cat of categorias) {
    const tipo = esCategoriaMoto(cat.categoria) ? "MOTO" : esCategoriaCarro(cat.categoria) ? "CARRO" : cat.categoria;

    const existente = normalizadas.find((item) => item.tipo === tipo);

    if (!existente) {
      normalizadas.push({ ...cat, tipo });
      continue;
    }

    const prioridadNueva = prioridad[cat.estadoCalculado] || 9;
    const prioridadActual = prioridad[existente.estadoCalculado] || 9;

    if (prioridadNueva < prioridadActual) {
      Object.assign(existente, { ...cat, tipo });
    }
  }

  return normalizadas.slice(0, 2);
}

function calcularEstadoVencimiento(fechaIso) {
  if (!fechaIso) return "SIN_FECHA";

  const hoy = new Date();
  const vence = new Date(fechaIso);

  hoy.setHours(0, 0, 0, 0);
  vence.setHours(0, 0, 0, 0);

  const diferenciaDias = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));

  if (diferenciaDias < 0) return "VENCIDA";
  if (diferenciaDias <= 30) return "PROXIMA";

  return "ACTIVA";
}

function esCategoriaMoto(categoria) {
  return categoria.startsWith("A");
}

function esCategoriaCarro(categoria) {
  return categoria.startsWith("B") || categoria.startsWith("C");
}

function generarOfertaSegunCategorias(categorias) {
  const tieneMoto = categorias.some((cat) => esCategoriaMoto(cat.categoria));
  const tieneCarro = categorias.some((cat) => esCategoriaCarro(cat.categoria));

  const tieneVencida = categorias.some((cat) => cat.estadoCalculado === "VENCIDA");
  const tieneProxima = categorias.some((cat) => cat.estadoCalculado === "PROXIMA");
  const tieneActiva = categorias.some((cat) => cat.estadoCalculado === "ACTIVA");

  let mensaje = `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensaje += `🎁 *Oferta recomendada para ti*\n\n`;

  if (tieneMoto && tieneCarro) {
    mensaje += `Vemos que tienes categorías de *moto y carro* registradas en RUNT. 🏍️🚗\n\n`;
    mensaje += `El valor normal para renovar dos categorías es de *$320.000*.\n`;
    mensaje += `Pero por esta semana tienes un descuento especial y pagas solo *$250.000*.\n`;
  } else if (tieneMoto) {
    mensaje += `Vemos que tienes categoría de *moto* registrada en RUNT. 🏍️\n\n`;
    mensaje += `El valor normal para renovar una categoría es de *$240.000*.\n`;
    mensaje += `Pero por esta semana tienes un descuento especial y pagas solo *$180.000*.\n`;
  } else if (tieneCarro) {
    mensaje += `Vemos que tienes categoría de *carro* registrada en RUNT. 🚗\n\n`;
    mensaje += `El valor normal para renovar una categoría es de *$240.000*.\n`;
    mensaje += `Pero por esta semana tienes un descuento especial y pagas solo *$180.000*.\n`;
  } else {
    mensaje += `Podemos ayudarte a revisar tu caso y orientarte con el trámite correcto. ✅\n`;
  }

  mensaje += `\n`;

  if (tieneVencida) {
    mensaje += `⚠️ También vemos que tienes una categoría vencida o con fecha vencida, por eso es buen momento para realizar la renovación.\n`;
  } else if (tieneProxima) {
    mensaje += `⏳ Tienes una categoría próxima a vencer. Te recomendamos aprovechar el descuento antes de que expire.\n`;
  } else if (tieneActiva) {
    mensaje += `✅ Tus categorías aparecen activas. Si deseas renovar o adelantar el proceso, esta semana puedes aprovechar el descuento.\n`;
  }

  mensaje += `\n¿Deseas que te ayudemos a agendar tu proceso?\n\n`;
  mensaje += `1️⃣ Sí, quiero agendar\n`;
  mensaje += `2️⃣ No por ahora\n`;

  return mensaje;
}

module.exports = {
  consultarRuntPorCedula,
  formatearResultadoWhatsApp,
};
