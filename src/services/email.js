async function enviarCorreoCita(datos) {
  if (!process.env.GOOGLE_SCRIPT_EMAIL_URL) {
    throw new Error("Falta GOOGLE_SCRIPT_EMAIL_URL para enviar correo");
  }

  if (!process.env.GOOGLE_SCRIPT_EMAIL_KEY) {
    throw new Error("Falta GOOGLE_SCRIPT_EMAIL_KEY para enviar correo");
  }

  const adminEmail = process.env.MAIL_TO_ADMIN || "ciavipbogota@gmail.com";

  const response = await fetch(process.env.GOOGLE_SCRIPT_EMAIL_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      apiKey: process.env.GOOGLE_SCRIPT_EMAIL_KEY,
      adminEmail,
      datos,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(
      `Error Google Script ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return true;
}

module.exports = {
  enviarCorreoCita,
};
