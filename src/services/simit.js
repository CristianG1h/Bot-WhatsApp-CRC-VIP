const { chromium } = require("playwright");

function dinero(valor) {
  if (valor === null || valor === undefined) return "$0";
  return "$" + Number(valor).toLocaleString("es-CO");
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
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click();
        await page.waitForTimeout(800);
        return;
      }
    } catch {}
  }
}

async function consultarSimitPorDocumento(documento) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://www.fcm.org.co/simit/#/home-public", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

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
    await input.fill(documento);

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/estadocuenta/consulta"),
      { timeout: 45000 }
    );

    await page.keyboard.press("Enter");

    const response = await responsePromise;
    const data = await response.json();

    await browser.close();
    return data;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

function formatearResultadoSimitWhatsApp(documento, data) {
  let mensaje = `🚨 *Consulta SIMIT realizada*\n\n`;
  mensaje += `📄 *Documento / Placa:* ${documento}\n`;
  mensaje += `💰 *Total general:* ${dinero(data.totalGeneral)}\n`;
  mensaje += `🚨 *Multas:* ${data.multas?.length || 0}\n`;
  mensaje += `📋 *Comparendos:* ${data.comparendos?.length || 0}\n`;
  mensaje += `✅ *Paz y salvo:* ${data.pazSalvo ? "Sí" : "No"}\n`;

  if (!data.multas || data.multas.length === 0) {
    mensaje += `\n✅ No registra multas pendientes en SIMIT.`;
    return mensaje;
  }

  mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensaje += `*Detalle de multas:*\n`;

  data.multas.slice(0, 5).forEach((multa, index) => {
    const infraccion = multa.infracciones?.[0];

    mensaje += `\n${index + 1}️⃣ *Multa ${index + 1}*\n`;
    mensaje += `🚗 Placa: ${multa.placa || "—"}\n`;
    mensaje += `📍 Organismo: ${multa.organismoTransito || "—"}\n`;
    mensaje += `📌 Estado: ${multa.estadoCartera || "—"}\n`;
    mensaje += `📅 Fecha comparendo: ${multa.fechaComparendo || "—"}\n`;
    mensaje += `💵 Valor a pagar: *${dinero(multa.valorPagar)}*\n`;

    if (infraccion) {
      mensaje += `⚠️ Código: ${infraccion.codigoInfraccion || "—"}\n`;
      mensaje += `📝 ${infraccion.descripcionInfraccion || "—"}\n`;
    }
  });

  if (data.cursos && data.cursos.length > 0) {
    mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    mensaje += `📘 *Cursos registrados:*\n`;

    data.cursos.slice(0, 3).forEach((curso, index) => {
      mensaje += `\n${index + 1}️⃣ Curso: ${curso.numeroCurso || "—"}\n`;
      mensaje += `📅 Fecha: ${curso.fechaCurso || "—"}\n`;
      mensaje += `🏫 Centro: ${curso.centroInstruccion || "—"}\n`;
      mensaje += `✅ Estado: ${curso.estado || "—"}\n`;
    });
  }

  mensaje += `\n¿Deseas hablar con un asesor de *CIA VIP*?\n\n`;
  mensaje += `1️⃣ Sí, hablar con asesor\n`;
  mensaje += `2️⃣ Volver al inicio`;

  return mensaje;
}

module.exports = {
  consultarSimitPorDocumento,
  formatearResultadoSimitWhatsApp,
};