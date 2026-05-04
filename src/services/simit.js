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
