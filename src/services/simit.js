const { chromium } = require("playwright");

const TARIFAS_COMPARENDO_2026 = {
  A: {
    valor: 168900,
    d50: { curso: 23600, transito: 63350, total: 84450 },
    d25: { curso: 34100, transito: 94975, total: 126675 },
  },
  B: {
    valor: 337700,
    d50: { curso: 44600, transito: 126650, total: 168850 },
    d25: { curso: 65700, transito: 189975, total: 253275 },
  },
  C: {
    valor: 633200,
    d50: { curso: 81600, transito: 237400, total: 316600 },
    d25: { curso: 121100, transito: 356200, total: 474900 },
  },
  D: {
    valor: 1266300,
    d50: { curso: 160700, transito: 474850, total: 633150 },
    d25: { curso: 239800, transito: 712325, total: 949725 },
  },
  H: {
    valor: 211100,
    d50: { curso: 42400, transito: null, total: null },
    d25: null,
  },
  I01: {
    valor: 422100,
    d50: { curso: 55163, transito: 158288, total: 211050 },
    d25: { curso: 77900, transito: 241075, total: 316575 },
  },
  I02: {
    valor: 4220335,
    d50: { curso: 530000, transito: 1582568, total: 2110168 },
    d25: null,
  },
  E: {
    valor: 1899300,
    d50: { curso: 239813, transito: 712238, total: 949650 },
    d25: { curso: 342100, transito: 1084775, total: 1424475 },
  },
};

function dinero(valor) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) return "—";
  return "$" + Math.round(Number(valor)).toLocaleString("es-CO");
}

function obtenerTipoInfraccion(codigo) {
  if (!codigo) return null;
  const limpio = String(codigo).trim().toUpperCase();

  if (limpio.startsWith("I01")) return "I01";
  if (limpio.startsWith("I02")) return "I02";

  return limpio.charAt(0);
}

function parseFechaSimit(fecha) {
  if (!fecha) return null;

  const [fechaParte] = String(fecha).split(" ");
  const [dia, mes, anio] = fechaParte.split("/").map(Number);

  if (!dia || !mes || !anio) return null;

  return new Date(anio, mes - 1, dia);
}

function sumarDiasHabiles(fechaInicio, diasHabiles) {
  const fecha = new Date(fechaInicio);
  let sumados = 0;

  while (sumados < diasHabiles) {
    fecha.setDate(fecha.getDate() + 1);
    const dia = fecha.getDay();

    if (dia !== 0 && dia !== 6) {
      sumados++;
    }
  }

  return fecha;
}

function hoySinHora() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

function calcularDescuento(item) {
  const infraccion = item.infracciones?.[0];
  const codigo = infraccion?.codigoInfraccion || "";
  const tipo = obtenerTipoInfraccion(codigo);
  const tarifa = TARIFAS_COMPARENDO_2026[tipo];

  if (!tarifa) {
    return {
      tipo,
      aplica: false,
      motivo: "No tenemos tarifa configurada para este tipo de infracción.",
    };
  }

  const esComparendo = item.comparendo === true;

  if (!esComparendo) {
    return {
      tipo,
      aplica: false,
      motivo: "Ya figura como multa/resolución. No aparece como comparendo con curso.",
    };
  }

  const esFotomulta = item.comparendosElectronicos === "S";
  const fechaBase = parseFechaSimit(item.fechaNotificacion || item.fechaComparendo);

  if (!fechaBase) {
    return {
      tipo,
      aplica: false,
      motivo: "No fue posible identificar la fecha para calcular descuento.",
    };
  }

  const hoy = hoySinHora();

  const limite50 = esFotomulta
    ? sumarDiasHabiles(fechaBase, 11)
    : sumarDiasHabiles(fechaBase, 5);

  const limite25 = esFotomulta
    ? sumarDiasHabiles(fechaBase, 26)
    : sumarDiasHabiles(fechaBase, 20);

  let porcentaje = null;

  if (hoy <= limite50) porcentaje = 50;
  else if (hoy <= limite25) porcentaje = 25;

  if (!porcentaje) {
    return {
      tipo,
      aplica: false,
      motivo: "Ya no aparece dentro del tiempo legal para descuento por curso.",
      limite50,
      limite25,
    };
  }

  const datos = porcentaje === 50 ? tarifa.d50 : tarifa.d25;

  if (!datos || datos.total === null) {
    return {
      tipo,
      aplica: false,
      motivo: `Este tipo de infracción no tiene tarifa disponible para ${porcentaje}%.`,
    };
  }

  return {
    tipo,
    aplica: true,
    porcentaje,
    esFotomulta,
    limite50,
    limite25,
    valorInfraccion: tarifa.valor,
    curso: datos.curso,
    transito: datos.transito,
    total: datos.total,
  };
}

async function consultarSimitPorDocumento(documento) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  });

  try {
    console.log("🌐 Abriendo SIMIT...");

    await page.goto("https://www.fcm.org.co/simit/#/home-public", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    console.log("⏳ Esperando validación automática de SIMIT...");
    await page.waitForTimeout(18000);

    const input = page.locator("#txtBusqueda");

    await input.waitFor({
      state: "visible",
      timeout: 60000,
    });

    console.log("⌨️ Escribiendo documento...");
    await input.click({ force: true });
    await input.fill("");
    await input.fill(String(documento).trim().toUpperCase());

    await page.waitForTimeout(1500);

    console.log("🔎 Consultando SIMIT...");

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/estadocuenta/consulta") &&
        res.status() === 200,
      { timeout: 90000 }
    );

    await page.keyboard.press("Enter");

    let response;

    try {
      response = await responsePromise;
    } catch {
      console.log("⚠️ No respondió con Enter. Intentando botón buscar...");

      const responsePromiseClick = page.waitForResponse(
        (res) =>
          res.url().includes("/estadocuenta/consulta") &&
          res.status() === 200,
        { timeout: 90000 }
      );

      await page.locator("#txtBusqueda").press("Enter").catch(() => {});
      await page.waitForTimeout(1000);

      try {
        const botones = page.locator("button");
        const count = await botones.count();

        for (let i = 0; i < count; i++) {
          const btn = botones.nth(i);
          const text = await btn.innerText().catch(() => "");

          if (
            text.toLowerCase().includes("buscar") ||
            text.toLowerCase().includes("consultar")
          ) {
            await btn.click({ force: true });
            break;
          }
        }
      } catch {}

      response = await responsePromiseClick;
    }

    const data = await response.json();

    console.log("✅ Respuesta SIMIT capturada");

    await browser.close();
    return data;
  } catch (error) {
    try {
      await page.screenshot({
        path: "simit-error.png",
        fullPage: true,
      });
    } catch {}

    await browser.close();
    throw error;
  }
}

function formatearFechaCorta(fecha) {
  const f = parseFechaSimit(fecha);
  if (!f) return "—";

  return f.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatearResultadoSimitWhatsApp(documento, data) {
  const registros = [
    ...(data.comparendos || []),
    ...(data.multas || []),
  ];

  const totalComparendos = registros.filter((r) => r.comparendo === true).length;
  const totalMultas = registros.filter((r) => r.comparendo !== true).length;

  let mensaje = `✅ *Consulta SIMIT realizada*\n\n`;
  mensaje += `📄 Documento / Placa: *${documento}*\n`;
  mensaje += `📋 Registros encontrados: *${registros.length}*\n`;
  mensaje += `🟡 Comparendos: *${totalComparendos}*\n`;
  mensaje += `🔴 Multas / resoluciones: *${totalMultas}*\n`;
  mensaje += `💵 Total registrado: *${dinero(data.totalGeneral)}*\n`;

  if (registros.length === 0) {
    mensaje += `\n✅ No registra comparendos ni multas pendientes.`;
    return mensaje;
  }

  mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensaje += `*Detalle para curso de comparendo:*\n`;

  registros.slice(0, 5).forEach((item, index) => {
    const infraccion = item.infracciones?.[0] || {};
    const codigo = infraccion.codigoInfraccion || "—";
    const calculo = calcularDescuento(item);

    const tipoRegistro = item.comparendo === true
      ? "🟡 Comparendo"
      : "🔴 Multa / resolución";

    mensaje += `\n${index + 1}️⃣ *${tipoRegistro}*\n`;
    mensaje += `🚗 Placa: ${item.placa || "—"}\n`;
    mensaje += `📍 Organismo: ${item.organismoTransito || "—"}\n`;
    mensaje += `⚠️ Código: ${codigo}\n`;
    mensaje += `📌 Tipo tarifa: ${calculo.tipo || "—"}\n`;
    mensaje += `📅 Fecha comparendo: ${formatearFechaCorta(item.fechaComparendo)}\n`;
    mensaje += `📨 Notificación: ${item.fechaNotificacion ? formatearFechaCorta(item.fechaNotificacion) : "No aplica"}\n`;
    mensaje += `💵 Valor infracción: *${dinero(calculo.valorInfraccion || item.valor || item.valorPagar)}*\n`;

    if (calculo.aplica) {
      mensaje += `\n✅ *Aplica descuento del ${calculo.porcentaje}%*\n`;
      mensaje += `🎓 Curso CIA VIP: *${dinero(calculo.curso)}*\n`;
      mensaje += `🏦 Pago tránsito/SIMIT: *${dinero(calculo.transito)}*\n`;
      mensaje += `💰 Total con descuento: *${dinero(calculo.total)}*\n`;

      if (calculo.limite50) {
        mensaje += `📅 Límite 50%: ${calculo.limite50.toLocaleDateString("es-CO")}\n`;
      }

      if (calculo.limite25) {
        mensaje += `📅 Límite 25%: ${calculo.limite25.toLocaleDateString("es-CO")}\n`;
      }
    } else {
      mensaje += `\n❌ *No aparece con descuento disponible para curso.*\n`;
      mensaje += `Motivo: ${calculo.motivo}\n`;
      mensaje += `💳 Valor a pagar: *${dinero(item.valorPagar || item.valor)}*\n`;
    }

    mensaje += `📝 ${infraccion.descripcionInfraccion || ""}\n`;
  });

  mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensaje += `¿Deseas que un asesor de *CIA VIP* revise tu caso?\n\n`;
  mensaje += `1️⃣ Sí, hablar con asesor\n`;
  mensaje += `2️⃣ Volver al inicio`;

  return mensaje;
}

module.exports = {
  consultarSimitPorDocumento,
  formatearResultadoSimitWhatsApp,
};
