<div align="center">
<img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white"/>
<img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white"/>
<img src="https://img.shields.io/badge/Playwright-Headless-2EAD33?style=for-the-badge&logo=playwright&logoColor=white"/>
<img src="https://img.shields.io/badge/Tesseract-OCR-5C5C5C?style=for-the-badge&logo=googlelens&logoColor=white"/>
<img src="https://img.shields.io/badge/Groq-IA-F55036?style=for-the-badge&logo=OpenAI&logoColor=white"/>
<img src="https://img.shields.io/badge/PostgreSQL-Dashboard-4169E1?style=for-the-badge&logo=postgresql&logoColor=white"/>

# 🤖 Bot WhatsApp — CRC VIP & CIA VIP

### Asistente automatizado para *Licencias de Conducción* y *Comparendos SIMIT*

🟢 En producción &nbsp;|&nbsp; 🟢 Doble línea de negocio &nbsp;|&nbsp; 🟢 Consulta RUNT en tiempo real &nbsp;|&nbsp; 🟢 Consulta SIMIT con Playwright &nbsp;|&nbsp; 🟢 Fallback con IA (Groq) &nbsp;|&nbsp; 🟢 Dashboard de estadísticas &nbsp;|&nbsp; 🟢 Integración Chatwoot

</div>
---

## 📋 Descripción

Chatbot automatizado para **VIP CRC Galerías** y **CIA VIP** que atiende a los usuarios directamente por WhatsApp.

El bot opera como primer punto de contacto: guía al usuario paso a paso, consulta su información oficial en el **RUNT** (licencias de conducción) y en el **SIMIT** (comparendos y multas), calcula descuentos vigentes por curso, agenda citas y envía la confirmación por correo, y cuando el usuario requiere atención personalizada **transfiere al equipo humano** (con registro opcional en **Chatwoot**). Preguntas fuera del flujo estructurado pueden resolverse con un **fallback de IA (Groq)** entrenado con el contexto oficial de CRC. Toda la actividad queda disponible en un **dashboard web protegido** con estadísticas en tiempo real.

---

## 🏗️ Arquitectura

```
Usuario WhatsApp
      ↓
Meta Cloud API  /  Twilio WhatsApp
      ↓
Servidor Node.js (Express)  :3000
      ↓
┌───────────────────────────────────────────────────┐
│                    /webhook                        │
│  ┌────────────────────────────────────────────┐   │
│  │  Sesiones en memoria · Rate limiting        │   │
│  │  Flujo conversacional (steps) · Anti-dup    │   │
│  └────────────────────────────────────────────┘   │
│      ↓         ↓          ↓         ↓        ↓     │
│  runt.js   simit.js    ai.js    email.js  chatwoot.js│
│ (Axios+OCR)(Playwright)(Groq)  (Google    (Notas    │
│                                 Script)    y asesor)│
└───────────────────────────────────────────────────┘
      ↓            ↓          ↓          ↓        ↓
  RUNT API   fcm.org.co   Groq API   Apps Script  Chatwoot
 (portal      /simit      (LLM)      (envío de     API
  público)  (scraping                 correos)
             headless)

              stats.js  →  PostgreSQL (o memoria)  →  Dashboard (/dashboard)
```

> No requiere base de datos para operar: sesiones y caché de RUNT viven en memoria/archivos JSON. **PostgreSQL es opcional** y solo se usa para persistir las estadísticas del dashboard entre despliegues; si `DATABASE_URL` no está configurada, el dashboard funciona igual pero en memoria.

---

## 🔄 Flujo del Usuario

```
1. Usuario escribe al número
        ↓
2. Bot detecta saludo → Menú inicial
        ↓
   ┌─────────────────────┬──────────────────────┐
   │  1️⃣ CRC             │  2️⃣ CIA VIP           │
   │  Licencias          │  Comparendos / SIMIT  │
   └─────────────────────┴──────────────────────┘
        ↓                         ↓
   Menú CRC                 Autorización
   ┌──────────┐              ACEPTO
   │Trámite   │                ↓
   │Información│          Documento/placa
   │Asesor    │                ↓
   └──────────┘         Consulta SIMIT
        ↓               (Playwright)
   Comparendos →              ↓
   Asistencia  →      Detalle + descuentos
   Cédula      →      50% / 25% calculados
        ↓                     ↓
   Consulta RUNT        Oferta asesor CIA VIP
   (Captcha + OCR)
        ↓
   Estado licencia + oferta
        ↓
   ¿Agendar cita? ──────► Día → Horario → Nombre →
        │                 Cédula → Teléfono → Correo →
        │                 Confirmación → Envío de correo
        ↓
   Asesor CRC VIP (Chatwoot)

  En cualquier paso libre, si el mensaje no coincide con
  el flujo esperado, la IA (Groq) intenta responder usando
  el contexto oficial de CRC antes de derivar a un asesor.
```

---

## ✨ Funcionalidades

### 🪪 Consulta RUNT en tiempo real
- Genera y resuelve el captcha del RUNT automáticamente con **Tesseract.js (OCR)**
- Autentica con la API oficial y obtiene el estado del conductor y sus licencias
- Clasifica categorías por tipo (moto / carro) y estado (activa / próxima / vencida)
- Genera una oferta de renovación personalizada con precios y descuentos vigentes
- Hasta **5 reintentos** automáticos si el OCR o la API fallan

### 🚦 Consulta SIMIT con Playwright
- Navega el portal oficial de la FCM de forma headless (sin interfaz)
- Extrae comparendos, multas y resoluciones por cédula o placa
- Calcula automáticamente si aplica descuento del **50 % o 25 %** por curso
- Usa las tarifas oficiales vigentes para todas las categorías (A, B, C, D, E, H, I01, I02)
- Distingue entre comparendos presenciales y fotomultas para los plazos de descuento

### 🧠 Fallback conversacional con IA (Groq)
- Cuando el mensaje del usuario no coincide con el flujo estructurado, se consulta a **Groq** (modelo configurable, por defecto `llama-3.3-70b-versatile`)
- El prompt se construye con el contexto oficial de CRC (`utils/aiPrompt.js` + `utils/messages.js`) y el estado actual de la sesión
- La respuesta se exige en **JSON estricto** (`respuesta`, `confianza`, `tema`) para poder validarla antes de enviarla
- Datos sensibles (correos, números largos) se enmascaran antes de enviarse a la IA
- Pasos críticos del flujo (citas, documentos, transferencia a asesor) quedan **protegidos** y nunca se delegan a la IA
- Si `GROQ_API_KEY` no está configurada, el bot sigue funcionando normalmente sin este fallback

### 📅 Agendamiento de citas con confirmación por correo
- Flujo guiado: día → horario → nombre → cédula → teléfono → correo → confirmación
- Valida cada dato (cédula, teléfono, correo) antes de avanzar
- Al confirmar, envía automáticamente un correo de notificación vía **Google Apps Script** (`services/email.js`)
- Si el envío falla, la solicitud queda registrada igualmente y se informa al usuario que un asesor la confirmará

### 💬 Integración con Chatwoot
- Registra automáticamente cada mensaje entrante y saliente como nota privada en la conversación del contacto
- Crea o reutiliza el contacto y la conversación en Chatwoot a partir del número de WhatsApp
- Marca la conversación cuando el usuario necesita un asesor humano
- Es completamente opcional: se activa solo si `CHATWOOT_ENABLED=true` y las variables de conexión están configuradas

### 📊 Dashboard de estadísticas
- Panel web en `/` y `/dashboard`, protegido con **autenticación básica** (`DASHBOARD_USER` / `DASHBOARD_PASS`)
- Muestra conversaciones únicas, mensajes recibidos/enviados, consultas RUNT y SIMIT, citas preconfirmadas, transferencias a asesor, mensajes no reconocidos, duplicados ignorados y bloqueos por rate limit
- Gráfica de actividad por día y por hora (zona horaria `America/Bogota`), con historial de últimas interacciones y buscador
- Se sirve con **preview enriquecido** (Open Graph / Twitter Card) cuando el enlace lo comparte un bot de WhatsApp, Facebook, Twitter, Telegram, LinkedIn, Discord o Slack, sin exponer el panel real
- Persiste en **PostgreSQL** si `DATABASE_URL` está configurada; si no, funciona en memoria (se reinicia con el servidor)

### 🤖 Gestión de sesiones y flujo conversacional
- Cada número de teléfono mantiene su propio estado de conversación en memoria
- Palabras clave globales (`hola`, `menu`, `volver`) reinician el flujo en cualquier momento
- Detecta preguntas frecuentes e intención de trámite (CRC vs. CIA VIP) desde el primer mensaje
- Reactivación automática del bot si el asesor humano queda inactivo más de 10 minutos
- Transferencia limpia al asesor humano con recopilación de datos del usuario

### 🛡️ Protección anti-spam
- Límite de **20 mensajes por minuto** por usuario (hasta **45** durante el llenado de formularios como agendamiento de citas)
- Detección de mensajes duplicados (por `messageId` o por contenido+origen) para evitar respuestas repetidas
- Bloqueo temporal automático si se excede el límite

### ⚡ Caché y límites de consulta RUNT
- Resultados cacheados durante **15 días** para reducir carga sobre la API oficial
- Límite configurable de **150 consultas por día**
- Delay aleatorio entre intentos (5 – 12 segundos) para evitar detección

### 📤 Compatibilidad dual de proveedores
- **Meta Cloud API** — responde directo vía Graph API
- **Twilio WhatsApp** — divide automáticamente mensajes largos en partes de máximo 1 300 caracteres

---

## ⚙️ Tecnologías

| Tecnología | Uso |
|---|---|
| **Node.js 20.x** | Runtime del servidor |
| **Express 5** | Framework HTTP y servidor del dashboard |
| **Playwright (Chromium)** | Scraping headless del portal SIMIT |
| **Tesseract.js** | OCR para resolver captchas del RUNT |
| **Axios** | Peticiones HTTP a la API del RUNT y a Groq |
| **Groq API** | Fallback conversacional con IA (LLM) |
| **PostgreSQL (`pg`)** | Persistencia opcional de estadísticas del dashboard |
| **Twilio SDK** | Envío de mensajes por Twilio WhatsApp |
| **WhatsApp Cloud API (Meta)** | Envío de mensajes por Meta |
| **Chatwoot API** | Registro de conversaciones y transferencia a asesor |
| **Google Apps Script** | Envío de correos de confirmación de citas |
| **Nodemailer** | Utilidades de correo (soporte adicional) |

---

## 🗂️ Estructura del Proyecto

```
📦 bot-whatsapp-crc-vip
├── 📄 package.json
└── 📁 src
    ├── 📄 server.js              ← Entrada principal, dashboard y API de stats ⭐
    ├── 📄 config.js              ← Variables de entorno
    ├── 📁 routes
    │   ├── 📄 whatsapp.js        ← Webhook principal y flujo conversacional ⭐
    │   └── 📄 health.js          ← Healthcheck
    ├── 📁 services
    │   ├── 📄 runt.js            ← Consulta RUNT (Axios + Tesseract OCR) ⭐
    │   ├── 📄 simit.js           ← Consulta SIMIT (Playwright headless) ⭐
    │   ├── 📄 ai.js              ← Fallback conversacional con Groq
    │   ├── 📄 email.js           ← Envío de correos de confirmación de citas
    │   ├── 📄 stats.js           ← Estadísticas del dashboard (PostgreSQL o memoria)
    │   ├── 📄 chatwoot.js        ← Integración con Chatwoot (notas y asesor)
    │   ├── 📄 whatsapp.js        ← Envío a Graph API (Meta)
    │   └── 📄 twilio.js          ← Envío vía Twilio
    ├── 📁 utils
    │   ├── 📄 sessions.js        ← Gestión de sesiones en memoria
    │   ├── 📄 rateLimit.js       ← Anti-spam por usuario
    │   ├── 📄 validation.js      ← Limpieza y validación de cédulas
    │   ├── 📄 messages.js        ← Respuestas, FAQ y contexto para la IA
    │   └── 📄 aiPrompt.js        ← Construcción del prompt del sistema para Groq
    └── 📁 public                 ← Dashboard web
        ├── 📄 dashboard.html
        ├── 📁 css/dashboard.css
        └── 📁 js/dashboard.js
```

> **Archivos generados en ejecución** (no se versionan):
> `cache-runt.json` · `daily-limit.json` · `captcha.png` · `simit-error.png`

---

## 🔐 Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

| Variable | Descripción | Requerida |
|---|---|:---:|
| `PORT` | Puerto del servidor (default: `3000`) | ⬜ |
| `VERIFY_TOKEN` | Token de verificación del webhook Meta | ✅ |
| `WHATSAPP_TOKEN` | Token de acceso de Meta Cloud API | ✅ |
| `PHONE_NUMBER_ID` | ID del número de WhatsApp en Meta | ✅ |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | ⬜ |
| `TWILIO_AUTH_TOKEN` | Auth Token de Twilio | ⬜ |
| `TWILIO_WHATSAPP_FROM` | Número Twilio (ej: `whatsapp:+14155238886`) | ⬜ |
| `GROQ_API_KEY` | API key de Groq para el fallback conversacional con IA | ⬜ |
| `GROQ_MODEL` | Modelo de Groq a usar (default: `llama-3.3-70b-versatile`) | ⬜ |
| `DASHBOARD_USER` | Usuario para autenticación básica del dashboard | ✅ (para usar el dashboard) |
| `DASHBOARD_PASS` | Contraseña para autenticación básica del dashboard | ✅ (para usar el dashboard) |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL para persistir estadísticas | ⬜ |
| `PUBLIC_URL` | URL pública del servicio, usada en el preview de redes sociales | ⬜ |
| `GOOGLE_SCRIPT_EMAIL_URL` | URL del Google Apps Script que envía el correo de citas | ⬜ (requerida para confirmar citas por correo) |
| `GOOGLE_SCRIPT_EMAIL_KEY` | Clave de autenticación del Apps Script | ⬜ (requerida para confirmar citas por correo) |
| `MAIL_TO_ADMIN` | Correo administrativo que recibe copia de las citas (default: `ciavipbogota@gmail.com`) | ⬜ |
| `CHATWOOT_ENABLED` | Activa la integración con Chatwoot (`true`/`false`) | ⬜ |
| `CHATWOOT_BASE_URL` | URL base de la instancia de Chatwoot | ⬜ (requerida si `CHATWOOT_ENABLED=true`) |
| `CHATWOOT_ACCOUNT_ID` | ID de la cuenta en Chatwoot | ⬜ (requerida si `CHATWOOT_ENABLED=true`) |
| `CHATWOOT_INBOX_ID` | ID del inbox de Chatwoot conectado al bot | ⬜ (requerida si `CHATWOOT_ENABLED=true`) |
| `CHATWOOT_API_TOKEN` | Token de acceso a la API de Chatwoot | ⬜ (requerida si `CHATWOOT_ENABLED=true`) |

> Las variables de Twilio, Groq, PostgreSQL, Chatwoot y correo son opcionales: si no se configuran, el bot sigue operando (solo con Meta, sin fallback de IA, con dashboard en memoria, sin registro en Chatwoot y sin envío automático de correos de citas, respectivamente).

---

## 🚀 Instalación y Uso

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/bot-whatsapp-crc-vip.git
cd bot-whatsapp-crc-vip

# 2. Instalar dependencias
npm install

# 3. Instalar navegadores de Playwright
npx playwright install chromium

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 5. Iniciar el servidor
npm start
```

Para exponer el servidor localmente durante desarrollo:

```bash
ngrok http 3000
# Usar la URL pública como webhook en Meta o Twilio
```

---

## 🌐 Endpoints Disponibles

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/` | Dashboard (protegido) o preview enriquecido si lo solicita un bot de redes sociales |
| `GET` | `/dashboard` | Dashboard de estadísticas (protegido con autenticación básica) |
| `GET` | `/api/stats` | Snapshot de estadísticas en JSON, con filtros por fecha/búsqueda (protegido) |
| `GET` | `/public/*` | Archivos estáticos del dashboard (protegidos) |
| `GET` | `/health` | Healthcheck JSON `{ ok: true, service: "Bot WhatsApp CRC VIP" }` |
| `GET` | `/webhook` | Verificación del webhook Meta (challenge) |
| `POST` | `/webhook` | Entrada de mensajes Meta Cloud API ⭐ |
| `POST` | `/webhook/twilio` | Entrada de mensajes Twilio ⭐ |

---

## 🛡️ Seguridad

- ✅ Tokens y credenciales almacenados en variables de entorno (nunca en código)
- ✅ Dashboard protegido con autenticación básica (`DASHBOARD_USER` / `DASHBOARD_PASS`)
- ✅ Rate limiting por número de teléfono (20 msg/min, 45 durante formularios)
- ✅ Detección y descarte de mensajes duplicados
- ✅ Datos sensibles enmascarados antes de enviarse a la IA (correos y números largos)
- ✅ Pasos críticos del flujo (citas, documentos, transferencia a asesor) nunca se delegan a la IA
- ✅ Caché con expiración automática para no sobrecargar la API del RUNT
- ✅ Manejo de errores en todas las consultas externas — el bot nunca queda colgado
- ✅ Límite diario de 150 consultas RUNT para evitar bloqueos

---

## 🔮 Mejoras Futuras

- [ ] Persistencia de sesiones en Redis (para múltiples instancias)
- [ ] Notificaciones salientes para recordatorio de citas
- [ ] Soporte multi-sede (múltiples CRC)
- [ ] Actualización automática de tarifas SIMIT por año
- [ ] Exportación de estadísticas del dashboard (CSV/Excel)

---

## 📌 Estado del Proyecto

| Item | Estado |
|---|---|
| Servidor en producción | 🟢 Activo |
| Bot respondiendo mensajes | 🟢 Activo |
| Consulta RUNT (OCR + API) | 🟢 Activo |
| Consulta SIMIT (Playwright) | 🟢 Activo |
| Fallback conversacional con IA (Groq) | 🟢 Activo |
| Agendamiento de citas + correo de confirmación | 🟢 Activo |
| Dashboard de estadísticas | 🟢 Activo |
| Integración Chatwoot | 🟢 Activo (opcional) |
| Transferencia a asesor | 🟢 Activo |
| Anti-spam | 🟢 Activo |
| Base de datos (bot) | ⚪ No utilizada — solo estadísticas del dashboard |

---

<div align="center">

## 👨‍💻 Autor

**Cristian Guarín**
Ingeniero en Sistemas
Bogotá, Colombia

---

*Desarrollado con ❤️ para VIP CRC Galerías & CIA VIP*

</div>
