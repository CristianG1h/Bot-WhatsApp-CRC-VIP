# Bot WhatsApp CRC VIP

Bot de atención y agendamiento para **VIP CRC Galerías**, integrado con **WhatsApp mediante Twilio**, Chatwoot, correo de confirmación, IA de respaldo y dashboard de estadísticas.

## Canal actual

El número del CRC está conectado a WhatsApp mediante **Twilio**. Por eso los componentes interactivos se generan con **Twilio Content API**:

- `twilio/quick-reply` para menús de hasta 3 opciones.
- `twilio/list-picker` para horarios y menús con más opciones.
- `mediaUrl` de Twilio para la foto de la sede y documentos.

Chatwoot conserva la conversación y las notas privadas, pero no se usa para construir los botones de WhatsApp.

## Flujo actual

El primer mensaje que envíe un usuario siempre inicia la misma interacción comercial, sin importar si escribe `Hola`, `Quiero renovar`, una pregunta o cualquier otro texto:

1. Pregunta si está interesado en renovar la licencia con botones **Sí / No**.
2. Si responde **Sí**, envía la foto guía de la sede por Twilio, muestra la promoción de renovación y ofrece **Agendar / No**.
3. Si responde **No**, ofrece **Primera vez / Información / Asesor**.
4. El agendamiento muestra únicamente días disponibles.
5. Domingos y festivos de Colombia se excluyen automáticamente.
6. Los sábados usan horario de 7:00 a.m. a 11:30 a.m.; lunes a viernes, de 7:00 a.m. a 3:30 p.m.
7. Los horarios se muestran mediante un List Picker de Twilio.
8. Solicita nombre completo, cédula, celular y correo.
9. Muestra un resumen con botones **Confirmar cita / Corregir datos**.
10. Envía la confirmación por correo y conserva las respuestas del bot como notas privadas en Chatwoot.
11. Después de la confirmación final, comparte la acreditación ONAC configurada para el CRC.

La fotografía utilizada está versionada en:

```text
src/assets/fachada-crc-vip.jpg
```

y Twilio la descarga desde la versión pública RAW del mismo repositorio.

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

- `GET /health` — estado del servicio, Twilio y notas de Chatwoot.
- `GET /webhook` — verificación del webhook de Meta si se conserva como compatibilidad.
- `POST /webhook` — compatibilidad con WhatsApp Cloud API.
- `POST /webhook/twilio` — entrada directa de Twilio si se configura ese webhook.
- `POST /webhook/chatwoot` — eventos de Chatwoot; es la ruta habitual cuando Twilio está conectado a Chatwoot.
- `GET /dashboard` — dashboard protegido.
- `GET /api/stats` — estadísticas del bot.

## Variables de entorno principales

```text
PORT
VERIFY_TOKEN

TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
TWILIO_MESSAGING_SERVICE_SID   # opcional

GROQ_API_KEY
GROQ_MODEL

CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_INBOX_ID
CHATWOOT_API_TOKEN
CHATWOOT_ENABLED

GOOGLE_SCRIPT_EMAIL_URL
GOOGLE_SCRIPT_EMAIL_KEY
MAIL_TO_ADMIN

DATABASE_URL
DASHBOARD_USER
DASHBOARD_PASS
PUBLIC_URL
```

`WHATSAPP_TOKEN` y `PHONE_NUMBER_ID` solo son necesarios si se quiere mantener además una integración directa separada con Meta; **no son necesarios para el flujo normal del CRC por Twilio**.

## Twilio Content API

El bot crea automáticamente y reutiliza plantillas internas con nombres como:

```text
crc_vip_qr_v2_1
crc_vip_qr_v2_2
crc_vip_qr_v2_3
crc_vip_list_v2_4
crc_vip_list_v2_7
```

Estas plantillas son para mensajes dentro de la ventana de atención iniciada por el usuario. Si Twilio no puede crear o enviar un componente interactivo, el bot vuelve automáticamente al texto normal para no bloquear la atención.

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
- La foto de la sede se envía por **Twilio** y no por Meta Cloud API.
- Los botones de hasta 3 opciones usan **Quick Reply**; los menús más largos usan **List Picker**.
- La IA recibe el mensaje sanitizado para omitir correos y secuencias numéricas largas antes de enviarlo al proveedor.
