# Bot WhatsApp CRC VIP

Bot de atención y agendamiento para **VIP CRC Galerías**, integrado con WhatsApp, Chatwoot, correo de confirmación, IA de respaldo y dashboard de estadísticas.

## Flujo actual

El primer mensaje que envíe un usuario siempre inicia la misma interacción comercial, sin importar si escribe `Hola`, `Quiero renovar`, una pregunta o cualquier otro texto:

1. Pregunta si está interesado en renovar la licencia.
2. Si responde **Sí**, muestra la promoción de renovación y pregunta si desea agendar.
3. Después del mensaje de promoción, envía la foto guía de la fachada de VIP CRC Galerías. La imagen se carga como binario a WhatsApp Cloud API y se envía mediante `media_id`, evitando depender de URLs externas.
4. Si responde **No**, ofrece primera vez, información o asesor.
5. El agendamiento muestra únicamente días disponibles.
6. Domingos y festivos de Colombia se excluyen automáticamente.
7. Los sábados usan horario de 7:00 a.m. a 11:30 a.m.; lunes a viernes, de 7:00 a.m. a 3:30 p.m.
8. Solicita nombre completo, cédula, celular y correo.
9. Muestra un resumen para confirmar.
10. Envía la confirmación por correo y conserva las respuestas del bot como notas privadas en Chatwoot.
11. Después de la confirmación final, comparte la acreditación ONAC configurada para el CRC.

## IA como fallback

La IA **no reemplaza el flujo principal** y no interviene en el primer mensaje. Solo se utiliza cuando el usuario ya está dentro del flujo y hace una pregunta que no corresponde a una opción o dato esperado.

Ejemplos:

- `¿Puedo pagar con tarjeta?`
- `¿Cuánto se demora el examen?`
- `¿Qué categoría necesito?`
- `¿Tienen parqueadero?`

Después de responder, la IA recuerda al usuario el paso en el que estaba para que pueda continuar con el agendamiento. Si `GROQ_API_KEY` no está configurada o el servicio de IA falla, el flujo normal continúa sin bloquearse.

Las consultas relacionadas con **habilitación, acreditación, ONAC, certificado, aval o autorización del CRC** se atienden con prioridad y comparten el soporte oficial sin perder el paso del agendamiento.

## Estructura principal

```text
src/
├── server.js
├── config.js
├── assets/
│   └── fachada-crc-vip.jpg
├── routes/
│   ├── aiFallback.js
│   ├── chatwootContext.js
│   ├── fotoSedeMiddleware.js
│   ├── habilitacionMiddleware.js
│   ├── health.js
│   └── whatsapp.js
├── services/
│   ├── chatwoot.js
│   ├── crcMedia.js
│   ├── email.js
│   ├── mediaHooks.js
│   ├── stats.js
│   ├── twilio.js
│   └── whatsapp.js
├── utils/
│   ├── agenda.js
│   ├── rateLimit.js
│   ├── sessions.js
│   └── validation.js
└── public/
    └── dashboard.html
```

## Endpoints principales

- `GET /health` — estado del servicio.
- `GET /webhook` — verificación del webhook de Meta.
- `POST /webhook` — mensajes de WhatsApp Cloud API.
- `POST /webhook/twilio` — fallback de Twilio.
- `POST /webhook/chatwoot` — eventos de Chatwoot.
- `GET /dashboard` — dashboard protegido.
- `GET /api/stats` — estadísticas del bot.

## Variables de entorno principales

```text
PORT
VERIFY_TOKEN
WHATSAPP_TOKEN
PHONE_NUMBER_ID

GROQ_API_KEY
GROQ_MODEL

CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_INBOX_ID
CHATWOOT_API_TOKEN
CHATWOOT_ENABLED

TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM

GOOGLE_SCRIPT_EMAIL_URL
GOOGLE_SCRIPT_EMAIL_KEY
MAIL_TO_ADMIN

DATABASE_URL
DASHBOARD_USER
DASHBOARD_PASS
PUBLIC_URL
```

## Ejecución

```bash
npm install
npm start
```

## Consideraciones

- El calendario trabaja con la zona horaria `America/Bogota`.
- Los festivos colombianos se calculan en código, incluidos los trasladables por Ley Emiliani y los relacionados con Pascua.
- Las notas privadas de Chatwoot registran las respuestas del bot para conservar trazabilidad.
- Cuando un asesor responde desde Chatwoot, el bot pausa la automatización temporalmente para evitar respuestas simultáneas.
- La foto de la sede se envía directamente por WhatsApp Cloud API usando upload de medios y `media_id`; Twilio y un enlace visible quedan como respaldo.
- La IA recibe el mensaje sanitizado para omitir correos y secuencias numéricas largas antes de enviarlo al proveedor.
