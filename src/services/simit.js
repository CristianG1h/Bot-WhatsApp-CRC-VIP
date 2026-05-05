const { chromium } = require("playwright");

function dinero(valor) {
  if (valor === null || valor === undefined) return "$0";
  return "$" + Math.round(Number(valor)).toLocaleString("es-CO");
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

const TARIFAS_CURSOS_2026 = {
  A: { curso50: 23600, curso25: 34100, operador: 25000 },
  B: { curso50: 44600, curso25: 65700, operador: 40000 },
  C: { curso50: 81600, curso25: 121100, operador: 78000 },
  D: { curso50: 160700, curso25: 239800, operador: 135000 },
  H: { curso50: 42400, curso25: null, operador: null },
  I01: { curso50: 55300, curso25: null, operador: null },
  I02: { curso50: 530000, curso25: null, operador: null },
  E: { curso50: 239800, curso25: 342000, operador: 200000 },
};

function dinero(valor) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) return "$0";
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

  const [fechaParte] = fecha.split(" ");
  const [dia, mes, anio] = fechaParte.split("/").map(Number);

  if (!dia || !mes || !anio) return null;

  return new Date(anio, mes - 1, dia);
}

function diasHabilesDesde(fechaInicio) {
  if (!fechaInicio) return null;

  const inicio = new Date(fechaInicio);
  const hoy = new Date();

  inicio.setHours(0, 0, 0, 0);
  hoy.setHours(0, 0, 0, 0);

  let dias = 0;
  const actual = new Date(inicio);

  while (actual <= hoy) {
    const dia = actual.getDay();

    if (dia !== 0 && dia !== 6) {
      dias++;
    }

    actual.setDate(actual.getDate() + 1);
  }

  return dias;
}

function calcularDescuento(multa) {
  const infraccion = multa.infracciones?.[0];
  const codigo = infraccion?.codigoInfraccion || "";
  const tipo = obtenerTipoInfraccion(codigo);
  const tarifa = TARIFAS_CURSOS_2026[tipo];

  const esFotomulta = multa.comparendosElectronicos === "S";
  const fechaBase = parseFechaSimit(multa.fechaNotificacion || multa.fechaComparendo);
  const diasHabiles = diasHabilesDesde(fechaBase);

  if (!tarifa || diasHabiles === null) {
    return {
      tipo,
      aplica: false,
      motivo: "No fue posible calcular descuento.",
      diasHabiles,
    };
  }

  let descuento = 0;

  if (esFotomulta) {
    if (diasHabiles <= 11) descuento = 50;
    else if (diasHabiles >= 12 && diasHabiles <= 26) descuento = 25;
  } else {
    if (diasHabiles <= 5) descuento = 50;
    else if (diasHabiles >= 6 && diasHabiles <= 20) descuento = 25;
  }

  if (!descuento) {
    return {
      tipo,
      aplica: false,
      motivo: "Ya no aparece dentro del tiempo de descuento para curso.",
      diasHabiles,
      esFotomulta,
    };
  }

  const valorComparendo = Number(multa.valor || multa.valorPagar || 0);
  const valorConDescuento = descuento === 50 ? valorComparendo * 0.5 : valorComparendo * 0.75;
  const valorCurso = descuento === 50 ? tarifa.curso50 : tarifa.curso25;

  return {
    tipo,
    aplica: true,
    descuento,
    diasHabiles,
    esFotomulta,
    valorComparendo,
    valorConDescuento,
    valorCurso,
    operador: tarifa.operador,
    valorPagarSimit: Math.max(valorConDescuento - valorCurso, 0),
  };
}

function formatearResultadoSimitWhatsApp(documento, data) {
  const pendientes = [
    ...(data.comparendos || []),
    ...(data.multas || []),
  ];

  let mensaje = `🚦 *Consulta SIMIT realizada*\n\n`;
  mensaje += `📄 *Documento / Placa:* ${documento}\n`;
  mensaje += `💰 *Total registrado:* ${dinero(data.totalGeneral)}\n`;
  mensaje += `📋 *Registros encontrados:* ${pendientes.length}\n`;

  if (pendientes.length === 0) {
    mensaje += `\n✅ No registra comparendos o multas pendientes.`;
    return mensaje;
  }

  mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensaje += `*Detalle para curso de comparendo:*\n`;

  pendientes.slice(0, 5).forEach((item, index) => {
    const infraccion = item.infracciones?.[0];
    const codigo = infraccion?.codigoInfraccion || "—";
    const calculo = calcularDescuento(item);

    const nombreRegistro = calculo.aplica
      ? "Comparendo con opción de curso"
      : "Multa / comparendo sin descuento vigente";

    mensaje += `\n${index + 1}️⃣ *${nombreRegistro}*\n`;
    mensaje += `🚗 Placa: ${item.placa || "—"}\n`;
    mensaje += `📍 Organismo: ${item.organismoTransito || "—"}\n`;
    mensaje += `⚠️ Código: ${codigo}\n`;
    mensaje += `📅 Fecha comparendo: ${item.fechaComparendo || "—"}\n`;
    mensaje += `📨 Notificación: ${item.fechaNotificacion || "No aplica"}\n`;

    if (calculo.diasHabiles !== null) {
      mensaje += `⏱️ Días hábiles aprox.: ${calculo.diasHabiles}\n`;
    }

    mensaje += `💵 Valor comparendo: ${dinero(calculo.valorComparendo || item.valorPagar)}\n`;

    if (calculo.aplica) {
      mensaje += `\n✅ *Aplica descuento del ${calculo.descuento}%*\n`;
      mensaje += `📌 Tipo infracción: ${calculo.tipo}\n`;
      mensaje += `🎓 Curso CIA VIP: ${dinero(calculo.valorCurso)}\n`;
      mensaje += `🏢 Costo operador: ${dinero(calculo.operador)}\n`;
      mensaje += `💳 Pago aprox. en SIMIT: ${dinero(calculo.valorPagarSimit)}\n`;
      mensaje += `💰 Valor con descuento: ${dinero(calculo.valorConDescuento)}\n`;
    } else {
      mensaje += `\n❌ *No aparece con descuento vigente para curso.*\n`;
      mensaje += `Motivo: ${calculo.motivo}\n`;
      mensaje += `💳 Valor a pagar: ${dinero(item.valorPagar)}\n`;
    }
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
