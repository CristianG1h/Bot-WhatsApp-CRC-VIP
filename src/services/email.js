async function enviarCorreoCita(datos) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Falta RESEND_API_KEY para enviar correo");
  }

  const adminEmail = process.env.MAIL_TO_ADMIN || "ciavipbogota@gmail.com";
  const mailFrom =
    process.env.MAIL_FROM || "VIP CRC Galerías <onboarding@resend.dev>";

  const subject = `Cita preconfirmada - ${datos.nombre}`;

  const html = crearHtmlCita(datos);
  const text = crearTextoCita(datos);

  const destinatarios = [datos.correo];

  if (adminEmail && adminEmail !== datos.correo) {
    destinatarios.push(adminEmail);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: destinatarios,
      subject,
      html,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Error Resend ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return true;
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

      <p>📍 <strong>Dirección:</strong> VIP CRC Galerías, Bogotá.</p>

      <p>Recuerda traer tu documento físico original.</p>

      <p>Un asesor de VIP CRC Galerías podrá contactarte para finalizar la confirmación de tu atención.</p>

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

module.exports = {
  enviarCorreoCita,
};
