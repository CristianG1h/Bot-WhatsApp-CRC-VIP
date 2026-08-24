# Bot WhatsApp CRC VIP

Bot de atención y agendamiento para **VIP CRC Galerías**, integrado con WhatsApp, Chatwoot, correo de confirmación y dashboard de estadísticas.

## Flujo actual

El primer mensaje que envíe un usuario siempre inicia la misma interacción comercial, sin importar si escribe `Hola`, `Quiero renovar`, una pregunta o cualquier otro texto:

1. Pregunta si está interesado en renovar la licencia.
2. Si responde **Sí**, muestra la promoción de renovación y pregunta si desea agendar.
3. Si responde **No**, ofrece primera vez, información o asesor.
4. El agendamiento muestra únicamente días disponibles.
5. Domingos y festivos de Colombia se excluyen automáticamente.
6. Los sábados usan horario de 7:00 a.m. a 11:30 a.m.; lunes a viernes, de 7:00 a.m. a 3:30 p.m.
7. Solicita nombre completo, cédula, celular y correo.
8. Muestra un resumen para confirmar.
9. Envía la confirmación por correo y conserva las respuestas del bot como notas privadas en Chatwoot.

## Estructura

```text
src/
├── server.js
├── config.js
├── routes/
│   ├── health.js
│   └── whatsapp.js
├── services/
│   ├── chatwoot.js
│   ├── email.js
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

El flujo comercial, el calendario y la captura de datos están consolidados en `src/routes/whatsapp.js`. Se eliminaron las capas y servicios heredados de RUNT, SIMIT e IA que ya no forman parte del proceso actual.

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
- Las notas privadas de Chatwoot registran los mensajes entrantes y las respuestas del bot para conservar trazabilidad.
- Cuando un asesor responde desde Chatwoot, el bot pausa la automatización temporalmente para evitar respuestas simultáneas.
