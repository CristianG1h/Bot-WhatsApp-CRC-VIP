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

function tipoInfraccion(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();

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

function detectarDescuento(item) {
  const infraccion = item.infracciones?.[0];
  const codigo = infraccion?.codigoInfraccion || "";
  const tipo = tipoInfraccion(codigo);
  const tarifa = TARIFAS_COMPARENDO_2026[tipo];

  if (!tarifa) {
    return {
      aplica: false,
      tipo,
      motivo: "No tenemos tarifa configurada para este tipo de infracción.",
    };
  }

  const esComparendo = item.comparendo === true;

  if (!esComparendo) {
    return {
      aplica: false,
      tipo,
      motivo: "Ya figura como multa/resolución. No aparece como comparendo con curso.",
    };
  }

  const esFotoMulta = item.comparendosElectronicos === "S";
  const fechaBase = parseFechaSimit(item.fechaNotificacion || item.fechaComparendo);

  if (!fechaBase) {
    return {
      aplica: false,
      tipo,
      motivo: "No fue posible identificar la fecha para calcular descuento.",
    };
  }

  const hoy = hoySinHora();

  const limite50 = esFotoMulta
    ? sumarDiasHabiles(fechaBase, 11)
    : sumarDiasHabiles(fechaBase, 5);

  const limite25 = esFotoMulta
    ? sumarDiasHabiles(fechaBase, 26)
    : sumarDiasHabiles(fechaBase, 20);

  let porcentaje = null;

  if (hoy <= limite50) porcentaje = 50;
  else if (hoy <= limite25) porcentaje = 25;

  if (!porcentaje) {
    return {
      aplica: false,
      tipo,
      motivo: "Ya no aparece dentro del tiempo legal para descuento por curso.",
      limite50,
      limite25,
    };
  }

  const datos = porcentaje === 50 ? tarifa.d50 : tarifa.d25;

  if (!datos || datos.total === null) {
    return {
      aplica: false,
      tipo,
      motivo: `Este tipo de infracción no tiene tarifa disponible para ${porcentaje}%.`,
    };
  }

  return {
    aplica: true,
    tipo,
    porcentaje,
    esFotoMulta,
    limite50,
    limite25,
    valorInfraccion: tarifa.valor,
    curso: datos.curso,
    transito: datos.transito,
    total: datos.total,
  };
}

async function cerrarPopup(page) {
  const posiblesBotones = [
    "button:has-text('×')",
    "button:has-text('x')",
    ".modal button.close",
    ".modal .close",
    "[aria-label='Close']",
    "[aria-label='Cerrar']",
    "button.close",
  ];

  for (const selector of posiblesBotones) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await page.waitForTimeout(1000);
        return;
      }
    } catch {}
  }
}

async function consultarSimitPorDocumento(documento) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  let ultimaRespuestaConsulta = null;

  page.on("response", async (response) => {
    const url = response.url();

    if (url.includes("/estadocuenta/consulta")) {
      try {
        ultimaRespuestaConsulta = await response.json();
        console.log("✅ Respuesta SIMIT capturada");
      } catch (e) {
        console.log("No se pudo leer JSON SIMIT:", e.message);
      }
    }
  });

  try {
    console.log("[1] Abriendo SIMIT...");
    await page.goto("https://www.fcm.org.co/simit/#/home-public", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    console.log("[2] Esperando validación inicial...");
    await page.waitForTimeout(8000);

    await cerrarPopup(page);

    const input = page.locator(
      'input[placeholder="Número de identificación o placa del vehículo"]'
    );

    await input.waitFor({
      state: "visible",
      timeout: 30000,
    });

    await input.fill("");
    await input.fill(String(documento).trim().toUpperCase());

    console.log("[3] Consultando documento...");

    const botonBuscar = page.locator("button").filter({
      has: page.locator("i, svg"),
    }).last();

    try {
      await botonBuscar.click({ timeout: 5000 });
    } catch {
      await page.keyboard.press("Enter");
    }

    await page.waitForResponse(
      (response) => response.url().includes("/estadocuenta/consulta"),
      { timeout: 45000 }
    );

    await page.waitForTimeout(3000);

    if (!ultimaRespuestaConsulta) {
      throw new Error("No se capturó JSON de SIMIT.");
    }

    await browser.close();
    return ultimaRespuestaConsulta;
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

  const mensajes = [];

  const totalComparendos = registros.filter((r) => r.comparendo === true).length;
  const totalMultas = registros.filter((r) => r.comparendo !== true).length;

  mensajes.push(
`✅ *Consulta SIMIT realizada*

📄 Documento / Placa: *${documento}*
📋 Registros encontrados: *${registros.length}*
🟡 Comparendos: *${totalComparendos}*
🔴 Multas / resoluciones: *${totalMultas}*
💵 Total registrado: *${dinero(data.totalGeneral)}*`
  );

  if (registros.length === 0) {
    mensajes.push("✅ No registra comparendos ni multas pendientes.");
    return mensajes;
  }

  registros.slice(0, 6).forEach((item, index) => {
    const infraccion = item.infracciones?.[0] || {};
    const codigo = infraccion.codigoInfraccion || "—";
    const calculo = detectarDescuento(item);

    const tipoRegistro = item.comparendo === true
      ? "🟡 Comparendo"
      : "🔴 Multa / resolución";

    let msg =
`📋 *Registro ${index + 1}*

${tipoRegistro}
🚗 Placa: ${item.placa || "—"}
📍 Organismo: ${item.organismoTransito || "—"}
⚠️ Código: ${codigo}
📌 Tipo tarifa: ${calculo.tipo || "—"}
📅 Fecha comparendo: ${formatearFechaCorta(item.fechaComparendo)}
📨 Notificación: ${item.fechaNotificacion ? formatearFechaCorta(item.fechaNotificacion) : "No aplica"}
💵 Valor infracción: *${dinero(calculo.valorInfraccion || item.valor || item.valorPagar)}*`;

    if (calculo.aplica) {
      msg += `

✅ *Aplica descuento del ${calculo.porcentaje}%*
🎓 Curso CIA VIP: *${dinero(calculo.curso)}*
🏦 Pago tránsito/SIMIT: *${dinero(calculo.transito)}*
💰 Total con descuento: *${dinero(calculo.total)}*`;

      if (calculo.limite50) {
        msg += `\n📅 Límite 50%: ${calculo.limite50.toLocaleDateString("es-CO")}`;
      }

      if (calculo.limite25) {
        msg += `\n📅 Límite 25%: ${calculo.limite25.toLocaleDateString("es-CO")}`;
      }
    } else {
      msg += `

❌ *No aparece con descuento disponible para curso*
Motivo: ${calculo.motivo}
💳 Valor a pagar: *${dinero(item.valorPagar || item.valor)}*`;
    }

    msg += `\n\n📝 ${infraccion.descripcionInfraccion || ""}`;

    mensajes.push(msg);
  });

  mensajes.push(
`¿Deseas que un asesor de *CIA VIP* revise tu caso?

1️⃣ Sí, hablar con asesor
2️⃣ Volver al inicio`
  );

  return mensajes;
}

module.exports = {
  consultarSimitPorDocumento,
  formatearResultadoSimitWhatsApp,
};
