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

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
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
        <li><strong>Horario aproximado:</strong> ${datos.horario}</li>
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

async function enviarCorreoCita(datos) {
  const transporter = getTransporter();

  const adminEmail =
    process.env.MAIL_TO_ADMIN ||
    process.env.SMTP_USER;

  const mailFrom =
    process.env.MAIL_FROM ||
    `"VIP CRC Galerías" <${process.env.SMTP_USER}>`;

  const subject = `Cita preconfirmada - ${datos.nombre}`;

  const html = crearHtmlCita(datos);

  const destinatarios = [datos.correo];

  if (adminEmail && adminEmail !== datos.correo) {
    destinatarios.push(adminEmail);
  }

  await transporter.sendMail({
    from: mailFrom,
    to: destinatarios.join(","),
    subject,
    html,
  });

  return true;
}

module.exports = {
  enviarCorreoCita,
};
