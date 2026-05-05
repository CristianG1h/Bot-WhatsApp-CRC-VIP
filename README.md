<div align="center">
<img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white"/>
<img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white"/>
<img src="https://img.shields.io/badge/Playwright-Headless-2EAD33?style=for-the-badge&logo=playwright&logoColor=white"/>
<img src="https://img.shields.io/badge/Tesseract-OCR-5C5C5C?style=for-the-badge&logo=googlelens&logoColor=white"/>
# 🤖 Bot WhatsApp — CRC VIP & CIA VIP
 
### Asistente automatizado para *Licencias de Conducción* y *Comparendos SIMIT*
 
🟢 En producción &nbsp;|&nbsp; 🟢 Doble línea de negocio &nbsp;|&nbsp; 🟢 Consulta RUNT en tiempo real &nbsp;|&nbsp; 🟢 Consulta SIMIT con Playwright &nbsp;|&nbsp; 🟢 Anti-spam activo
 
</div>
---
 
## 📋 Descripción
 
Chatbot automatizado para **VIP CRC Galerías** y **CIA VIP** que atiende a los usuarios directamente por WhatsApp.
 
El bot opera como primer punto de contacto: guía al usuario paso a paso, consulta su información oficial en el **RUNT** (licencias de conducción) y en el **SIMIT** (comparendos y multas), calcula descuentos vigentes por curso, y cuando el usuario requiere atención personalizada **transfiere al equipo humano**.
 
---
 
## 🏗️ Arquitectura
 
```
Usuario WhatsApp
      ↓
Meta Cloud API  /  Twilio WhatsApp
      ↓
Servidor Node.js (Express)  :3000
      ↓
┌─────────────────────────────────────┐
│           /webhook                  │
│  ┌────────────────────────────────┐ │
│  │  Sesiones en memoria           │ │
│  │  Rate limiting por usuario     │ │
│  │  Flujo conversacional (steps)  │ │
│  └────────────────────────────────┘ │
│           ↓              ↓          │
│      runt.js          simit.js      │
│  (Axios + OCR)    (Playwright)      │
└─────────────────────────────────────┘
      ↓                    ↓
  RUNT API           fcm.org.co/simit
(portalpublico       (scraping headless)
  .runt.gov.co)
```
 
> No se usa base de datos — todo en memoria y caché en archivos JSON locales.
 
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
   Estado licencia +
   Oferta personalizada
        ↓
   Asesor CRC VIP
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
- Usa las tarifas oficiales 2026 para todas las categorías (A, B, C, D, E, H, I01, I02)
- Distingue entre comparendos presenciales y fotomultas para los plazos de descuento
### 🤖 Gestión de sesiones y flujo conversacional
- Cada número de teléfono mantiene su propio estado de conversación en memoria
- Palabras clave globales (`hola`, `menu`, `volver`) reinician el flujo en cualquier momento
- Transferencia limpia al asesor humano con recopilación de datos del usuario
### 🛡️ Protección anti-spam
- Límite de **8 mensajes por minuto** por usuario
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
| **Express 5** | Framework HTTP |
| **Playwright (Chromium)** | Scraping headless del portal SIMIT |
| **Tesseract.js** | OCR para resolver captchas del RUNT |
| **Axios** | Peticiones HTTP a la API del RUNT |
| **Twilio SDK** | Envío de mensajes por Twilio WhatsApp |
| **WhatsApp Cloud API (Meta)** | Envío de mensajes por Meta |
 
---
 
## 🗂️ Estructura del Proyecto
 
```
📦 bot-whatsapp-crc-vip
├── 📄 package.json
└── 📁 src
    ├── 📄 server.js              ← Entrada principal
    ├── 📄 config.js              ← Variables de entorno
    ├── 📁 routes
    │   ├── 📄 whatsapp.js        ← Webhook principal y flujo conversacional ⭐
    │   └── 📄 health.js          ← Healthcheck
    ├── 📁 services
    │   ├── 📄 runt.js            ← Consulta RUNT (Axios + Tesseract OCR) ⭐
    │   ├── 📄 simit.js           ← Consulta SIMIT (Playwright headless) ⭐
    │   ├── 📄 whatsapp.js        ← Envío a Graph API (Meta)
    │   ├── 📄 twilio.js          ← Envío vía Twilio
    │   └── 📄 chatwoot.js        ← Reservado para integración futura
    └── 📁 utils
        ├── 📄 sessions.js        ← Gestión de sesiones en memoria
        ├── 📄 rateLimit.js       ← Anti-spam por usuario
        ├── 📄 validation.js      ← Limpieza y validación de cédulas
        └── 📄 messages.js        ← Respuestas con variación aleatoria
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
 
> Las variables de Twilio son opcionales. Si no se configuran, el bot opera solo con Meta y registra los mensajes en consola.
 
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
| `GET` | `/` | Healthcheck simple |
| `GET` | `/health` | Healthcheck JSON `{ ok: true }` |
| `GET` | `/webhook` | Verificación del webhook Meta (challenge) |
| `POST` | `/webhook` | Entrada de mensajes Meta Cloud API ⭐ |
| `POST` | `/webhook/twilio` | Entrada de mensajes Twilio ⭐ |
 
---
 
## 🛡️ Seguridad
 
- ✅ Tokens y credenciales almacenados en variables de entorno (nunca en código)
- ✅ Rate limiting por número de teléfono (máx. 8 msg/min)
- ✅ Caché con expiración automática para no sobrecargar la API del RUNT
- ✅ Manejo de errores en todas las consultas externas — el bot nunca queda colgado
- ✅ Límite diario de 150 consultas RUNT para evitar bloqueos
---
 
## 🔮 Mejoras Futuras
 
- [ ] Persistencia de sesiones en Redis (para múltiples instancias)
- [ ] Dashboard de métricas de atención
- [ ] Integración completa con Chatwoot para transferencia a asesor
- [ ] Notificaciones salientes para recordatorio de citas
- [ ] Soporte multi-sede (múltiples CRC)
- [ ] Actualización automática de tarifas SIMIT por año
---
 
## 📌 Estado del Proyecto
 
| Item | Estado |
|---|---|
| Servidor en producción | 🟢 Activo |
| Bot respondiendo mensajes | 🟢 Activo |
| Consulta RUNT (OCR + API) | 🟢 Activo |
| Consulta SIMIT (Playwright) | 🟢 Activo |
| Transferencia a asesor | 🟢 Activo |
| Anti-spam | 🟢 Activo |
| Base de datos | ⚪ No utilizada |
| Integración Chatwoot | 🟡 Pendiente |
 
---
 
<div align="center">
## 👨‍💻 Autor
 
**Cristian Guarín**
Ingeniero en Sistemas
Bogotá, Colombia
 
---
 
*Desarrollado con ❤️ para VIP CRC Galerías & CIA VIP*
 
</div>
