<div align="center">

<img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white"/>
<img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white"/>
<img src="https://img.shields.io/badge/Playwright-Headless-2EAD33?style=for-the-badge&logo=playwright&logoColor=white"/>
<img src="https://img.shields.io/badge/Tesseract-OCR-5C5C5C?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Groq-IA-F55036?style=for-the-badge"/>
<img src="https://img.shields.io/badge/PostgreSQL-Dashboard-4169E1?style=for-the-badge&logo=postgresql&logoColor=white"/>

# Bot WhatsApp — CRC VIP & CIA VIP

### Licencias de conducción · RUNT · SIMIT · Citas · Chatwoot · IA

**En producción · Doble línea de negocio · Dashboard · Asesor humano · Meta/Twilio**

</div>

> **Documentación actualizada: 12 de agosto de 2026.**

## Descripción

Bot automatizado para **VIP CRC Galerías** y **CIA VIP** que atiende usuarios por WhatsApp y los orienta según dos líneas principales:

- **CRC:** trámites relacionados con licencias de conducción, consulta RUNT, orientación y agendamiento.
- **CIA VIP:** consulta de comparendos/SIMIT y orientación sobre cursos y descuentos aplicables.

El sistema combina un flujo conversacional controlado con servicios externos, dashboard de estadísticas, transferencia a asesor humano y un fallback de IA para preguntas que no pertenecen a pasos críticos.

## Arquitectura

```text
Usuario WhatsApp
      │
      ├── Meta Cloud API
      └── Twilio WhatsApp
             │
             ▼
      Node.js + Express
             │
             ├── Flujo conversacional / sesiones
             ├── Consulta RUNT + OCR
             ├── Consulta SIMIT + Playwright
             ├── Agendamiento y correo
             ├── Fallback IA con Groq
             ├── Integración Chatwoot
             ├── Anti-spam / deduplicación
             └── Estadísticas
                      │
                      ├── PostgreSQL
                      └── fallback en memoria

Dashboard: / y /dashboard
```

## Flujo CRC actualizado

```text
Usuario escribe
     │
     ▼
Menú inicial
     │
     ├── CRC - Licencias
     │      │
     │      ├── Tipo de trámite
     │      ├── Validaciones del flujo
     │      ├── Cédula
     │      └── Consulta RUNT
     │              │
     │              ├── Estado de licencias
     │              ├── Categorías / vigencia
     │              ├── Nombre registrado en RUNT
     │              └── Oferta/orientación
     │
     │      ¿Desea agendar?
     │              │
     │              ▼
     │        Día → Horario
     │              │
     │              ▼
     │   Confirmar nombre obtenido del RUNT
     │        │                   │
     │       Sí                  No
     │        │                   │
     │        │            Escribir nombre correcto
     │        │                   │
     │        └──────────┬────────┘
     │                   ▼
     │        Teléfono → Correo → Confirmación
     │                   │
     │                   └── correo de cita
     │
     └── CIA VIP - Comparendos
            │
            ├── autorización
            ├── documento/placa
            ├── consulta SIMIT
            └── detalle + orientación/descuentos
```

## Mejora reciente: nombre y cédula desde RUNT

El flujo de citas fue optimizado para evitar pedir datos que el sistema ya conoce.

Después de una consulta RUNT exitosa:

1. el bot obtiene los nombres y apellidos disponibles en la respuesta;
2. conserva la cédula que ya fue validada;
3. después de seleccionar día y horario muestra el nombre registrado en RUNT;
4. pregunta si ese nombre es correcto para la cita;
5. si el usuario responde **sí**, reutiliza automáticamente nombre y cédula y continúa directamente con el teléfono;
6. si responde **no**, solicita el nombre completo corregido antes de continuar.

El paso `CONFIRMAR_NOMBRE_RUNT` está protegido frente al fallback de IA para evitar que una respuesta generativa altere datos críticos del agendamiento.

## Consulta RUNT

- Consulta información del conductor y sus licencias.
- Utiliza OCR con **Tesseract.js** para resolver el captcha necesario dentro del flujo configurado.
- Clasifica categorías y estados de licencia.
- Distingue escenarios de primera vez y renovación según la información encontrada.
- Puede generar orientación/oferta relacionada con el estado del trámite.
- Maneja reintentos cuando la lectura OCR o la consulta presentan errores.
- Conserva caché para reducir consultas repetidas.
- Incluye un límite diario configurable para proteger el servicio.

## Consulta SIMIT / CIA VIP

El flujo CIA utiliza **Playwright** para consultar el portal correspondiente y procesar información de comparendos.

Puede:

- consultar por documento o placa según el flujo;
- extraer comparendos, multas o resoluciones disponibles;
- diferenciar tipos de comparendo para la lógica operativa;
- calcular orientación sobre descuentos del 50 % o 25 % cuando aplique según las reglas configuradas;
- dirigir al usuario a un asesor CIA cuando requiere continuación humana.

## Agendamiento de citas

El flujo valida progresivamente:

- día;
- horario;
- nombre confirmado desde RUNT o corregido por el usuario;
- cédula ya validada o capturada cuando sea necesario;
- teléfono;
- correo;
- confirmación final.

Cuando la integración está configurada, el bot envía el correo de la cita mediante **Google Apps Script**.

Si el correo falla, el flujo conserva los datos y puede informar al usuario que la confirmación será continuada por un asesor.

## Sesiones y normalización de teléfonos

Las sesiones fueron reforzadas para que un mismo usuario no termine con estados duplicados por diferencias de formato.

El identificador interno normaliza valores como:

```text
whatsapp:+573001234567
+57 300 123 4567
573001234567
```

Esto permite mantener una misma sesión lógica independientemente del formato usado por Meta, Twilio o una integración intermedia.

La sesión conserva, entre otros datos:

- paso actual;
- línea CRC/CIA;
- trámite;
- cédula;
- datos SIMIT;
- horario de cita;
- `nombreRunt`;
- nombre definitivo de cita;
- teléfono y correo;
- estado de asesor;
- destino real de respuesta (`replyTo`).

## Asesor humano y Chatwoot

- El bot puede derivar usuarios a asesor.
- Mantiene estados para saber si el asesor está disponible/activo y si el bot debe permanecer pausado.
- Puede registrar actividad en Chatwoot cuando la integración está habilitada.
- Crea o reutiliza contacto/conversación según la lógica configurada.
- Puede reactivar el bot después de un período de inactividad del asesor.
- Los pasos críticos del formulario permanecen controlados por lógica determinística.

## Fallback conversacional con IA

Cuando `GROQ_API_KEY` está configurada, el bot puede utilizar Groq para responder preguntas libres que no encajan en el flujo estructurado.

La IA:

- recibe contexto del negocio y del estado de conversación;
- utiliza un modelo configurable;
- devuelve una respuesta estructurada para ser validada antes del envío;
- recibe datos sensibles enmascarados cuando corresponde;
- **no interviene en pasos críticos** como documentos, confirmaciones de nombre, citas o transferencias al asesor.

Si Groq no está configurado, el bot continúa funcionando con sus flujos normales.

## Dashboard de estadísticas

Disponible en:

```text
/
/dashboard
```

Protegido mediante `DASHBOARD_USER` y `DASHBOARD_PASS`.

Incluye métricas como:

- conversaciones únicas;
- mensajes recibidos/enviados;
- consultas RUNT;
- consultas SIMIT;
- citas preconfirmadas;
- transferencias a asesor;
- mensajes no reconocidos;
- duplicados ignorados;
- bloqueos por rate limit;
- actividad por día/hora;
- últimas interacciones;
- buscador y filtros.

Las fechas del dashboard se manejan con referencia a `America/Bogota`.

Cuando el enlace es consultado por bots de previsualización de WhatsApp, Facebook, Telegram, LinkedIn, Discord, Slack u otras plataformas soportadas, se muestra una tarjeta pública sin exponer el dashboard real.

## Persistencia

PostgreSQL es opcional para la operación conversacional, pero permite conservar las estadísticas entre reinicios/despliegues.

```env
DATABASE_URL=...
```

Sin esa variable, el dashboard puede funcionar con almacenamiento temporal en memoria.

## Anti-spam y deduplicación

- Rate limiting por número de teléfono.
- Límite ampliado durante pasos de formularios para no bloquear a un usuario que está completando datos legítimamente.
- Deduplicación por identificador de mensaje o combinación de contenido/origen.
- Bloqueo temporal cuando se supera el límite configurado.
- Prevención de respuestas duplicadas ante reintentos de webhooks.

## Caché RUNT

El sistema utiliza caché para reducir consultas repetidas al RUNT y proteger la disponibilidad del flujo.

La implementación actual contempla:

- resultados cacheados por un período prolongado configurable;
- límite diario de consultas;
- reintentos controlados;
- esperas entre intentos cuando se requiere.

## Compatibilidad de proveedores

### Meta Cloud API

Canal principal de WhatsApp mediante Graph API.

### Twilio WhatsApp

Existe compatibilidad con Twilio y manejo de mensajes largos mediante división controlada cuando corresponde.

## Tecnologías

| Tecnología | Uso |
|---|---|
| Node.js | Runtime |
| Express 5 | Servidor HTTP |
| Playwright | Automatización SIMIT |
| Tesseract.js | OCR de captcha RUNT |
| Axios | Peticiones HTTP |
| Groq | Fallback IA |
| PostgreSQL (`pg`) | Persistencia de estadísticas |
| Twilio SDK | Canal WhatsApp alternativo |
| Meta Cloud API | Canal WhatsApp principal |
| Chatwoot API | Atención humana/trazabilidad |
| Google Apps Script | Correo de citas |
| Nodemailer | Soporte adicional de correo |

## Estructura principal

```text
Bot-WhatsApp-CRC-VIP/
├── package.json
├── package-lock.json
└── src/
    ├── server.js
    ├── config.js
    ├── routes/
    │   ├── whatsapp.js
    │   └── health.js
    ├── services/
    │   ├── runt.js
    │   ├── simit.js
    │   ├── ai.js
    │   ├── email.js
    │   ├── stats.js
    │   ├── chatwoot.js
    │   ├── whatsapp.js
    │   └── twilio.js
    ├── utils/
    │   ├── sessions.js
    │   ├── rateLimit.js
    │   ├── validation.js
    │   ├── messages.js
    │   └── aiPrompt.js
    └── public/
        ├── dashboard.html
        ├── css/
        └── js/
```

Archivos generados en ejecución, según el flujo, pueden incluir cachés, límites diarios, capturas de captcha o imágenes de diagnóstico. No deben versionarse si contienen información temporal.

## Variables de entorno

| Variable | Uso |
|---|---|
| `PORT` | Puerto del servidor |
| `VERIFY_TOKEN` | Verificación webhook Meta |
| `WHATSAPP_TOKEN` | Token Meta |
| `PHONE_NUMBER_ID` | Número Meta |
| `TWILIO_ACCOUNT_SID` | Cuenta Twilio opcional |
| `TWILIO_AUTH_TOKEN` | Token Twilio opcional |
| `TWILIO_WHATSAPP_FROM` | Número de salida Twilio |
| `GROQ_API_KEY` | Fallback IA opcional |
| `GROQ_MODEL` | Modelo Groq |
| `DASHBOARD_USER` | Usuario dashboard |
| `DASHBOARD_PASS` | Contraseña dashboard |
| `DATABASE_URL` | PostgreSQL opcional |
| `PUBLIC_URL` | URL pública del servicio |
| `GOOGLE_SCRIPT_EMAIL_URL` | Apps Script de correo |
| `GOOGLE_SCRIPT_EMAIL_KEY` | Clave del Apps Script |
| `MAIL_TO_ADMIN` | Destinatario administrativo |
| `CHATWOOT_ENABLED` | Activa/desactiva Chatwoot |
| `CHATWOOT_BASE_URL` | URL Chatwoot |
| `CHATWOOT_ACCOUNT_ID` | Cuenta Chatwoot |
| `CHATWOOT_INBOX_ID` | Inbox Chatwoot |
| `CHATWOOT_API_TOKEN` | Token Chatwoot |

Todas las credenciales deben mantenerse en **Render → Environment** o en un `.env` local no versionado.

## Instalación

```bash
git clone https://github.com/CristianG1h/Bot-WhatsApp-CRC-VIP.git
cd Bot-WhatsApp-CRC-VIP
npm install
npx playwright install chromium
npm start
```

## Endpoints

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/` | Dashboard protegido o preview para bots. |
| `GET` | `/dashboard` | Dashboard. |
| `GET` | `/api/stats` | Estadísticas JSON. |
| `GET` | `/public/*` | Recursos del dashboard. |
| `GET` | `/health` | Health check. |
| `GET` | `/webhook` | Verificación Meta. |
| `POST` | `/webhook` | Entrada Meta. |
| `POST` | `/webhook/twilio` | Entrada Twilio. |

## Seguridad

- Credenciales únicamente en variables de entorno.
- Dashboard protegido con autenticación básica.
- Datos sensibles enmascarados antes del fallback IA cuando corresponde.
- Pasos críticos excluidos del control de la IA.
- Rate limiting y deduplicación.
- Caché y límites para evitar abuso de consultas externas.
- Manejo controlado de errores para que una integración externa no bloquee todo el bot.
- Normalización de identificadores telefónicos para mantener sesiones coherentes.

## Cambios recientes consolidados

### 30 de julio de 2026

- Normalización del identificador telefónico de las sesiones.
- Estados de asesor y destino de respuesta reforzados.
- Incorporación de `nombreRunt` dentro de la sesión.
- Obtención de nombres y apellidos desde la consulta RUNT.
- Nuevo paso `CONFIRMAR_NOMBRE_RUNT`.
- Reutilización automática de la cédula ya consultada durante el agendamiento.
- Si el nombre del RUNT es correcto, el flujo evita pedir nuevamente nombre y cédula y avanza al teléfono.
- Si el nombre no es correcto, permite capturar el nombre corregido.
- Ajustes en el resumen/confirmación de datos de la cita.

## Estado

| Componente | Estado |
|---|---|
| Bot CRC | Activo |
| Bot CIA/SIMIT | Activo |
| Consulta RUNT | Activa |
| Confirmación de nombre RUNT | Activa |
| Consulta SIMIT | Activa |
| Agendamiento | Activo |
| Correo de citas | Activo cuando está configurado |
| Groq IA | Opcional/activo con configuración |
| Chatwoot | Opcional/activo con configuración |
| Dashboard | Activo |
| PostgreSQL | Opcional para persistencia |
| Anti-spam y deduplicación | Activos |

---

<div align="center">

**Cristian Guarín**  
VIP CRC Galerías & CIA VIP — Bogotá, Colombia.

</div>
