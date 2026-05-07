const nodemailer = require("nodemailer");

function getTransporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_PORT ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    throw new Error("Faltan variables SMTP para enviar correo");
  }

  const port = Number(process.env.SMTP_PORT);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: port === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: String(process.env.SMTP_PASS).replace(/\s+/g, ""),
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
}

function crearHtmlCita(datos) {
  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
      <h2>✅ Cita preconfirmada - VIP CRC Galerías</h2>

      <p>Hola <strong>${datos.nombre}</strong>,</p>

      <p>Tu solicitud de cita fue recibida correctamente.</p>

      <h3>Datos de la cita</h3>

      <ul>
        <li><strong>Nombre:</strong> ${datos.nombre}</li>
        <li><strong>Cédula:</strong> ${datos.cedula}</li>
        <li><strong>Teléfono:</strong> ${datos.telefono}</li>
        <li><strong>Correo:</strong> ${datos.correo}</li>
        <li><strong>Trámite:</strong> ${datos.tramite || "Licencia de conducción"}</li>
        <li><strong>Día:</strong> ${datos.dia || "Día por confirmar"}</li>
        <li><strong>Horario aproximado:</strong> ${datos.horario || "Horario por confirmar"}</li>
      </ul>

      <p>
        📍 <strong>Dirección:</strong> VIP CRC Galerías, Bogotá.
      </p>

      <p>
        Recuerda traer tu documento físico original.
      </p>

      <p>
        Un asesor de VIP CRC Galerías podrá contactarte para finalizar la confirmación de tu atención.
      </p>

      <br />

      <p>
        Gracias,<br />
        <strong>VIP CRC Galerías</strong>
      </p>
    </div>
  `;
}

function crearTextoCita(datos) {
  return `Cita preconfirmada - VIP CRC Galerías

Hola ${datos.nombre},

Tu solicitud de cita fue recibida correctamente.

Datos de la cita:
- Nombre: ${datos.nombre}
- Cédula: ${datos.cedula}
- Teléfono: ${datos.telefono}
- Correo: ${datos.correo}
- Trámite: ${datos.tramite || "Licencia de conducción"}
- Día: ${datos.dia || "Día por confirmar"}
- Horario aproximado: ${datos.horario || "Horario por confirmar"}

Dirección: VIP CRC Galerías, Bogotá.

Recuerda traer tu documento físico original.

Un asesor de VIP CRC Galerías podrá contactarte para finalizar la confirmación de tu atención.

Gracias,
VIP CRC Galerías`;
}

async function enviarCorreoCita(datos) {
  const transporter = getTransporter();

  const adminEmail = process.env.MAIL_TO_ADMIN || process.env.SMTP_USER;

  const mailFrom =
    process.env.MAIL_FROM || `"VIP CRC Galerías" <${process.env.SMTP_USER}>`;

  const subject = `Cita preconfirmada - ${datos.nombre}`;

  const html = crearHtmlCita(datos);
  const text = crearTextoCita(datos);

  const destinatarios = [datos.correo];

  if (adminEmail && adminEmail !== datos.correo) {
    destinatarios.push(adminEmail);
  }

  await transporter.sendMail({
    from: mailFrom,
    to: destinatarios.join(","),
    subject,
    text,
    html,
  });

  return true;
}

module.exports = {
  enviarCorreoCita,
};
