# Bot WhatsApp CRC VIP

Asistente de VIP CRC Galerías para información del examen de aptitud y solicitudes de cita. Canal principal: WhatsApp mediante Twilio; Chatwoot conserva la conversación y recibe los casos que requieren asesor.

## Flujo de atención

1. Saluda y pregunta si el cliente está interesado en renovar. Una consulta concreta recibe respuesta también en el primer mensaje.
2. Si responde **sí**, informa el precio del examen, comparte ubicación y conserva la pregunta **«¿Deseas agendar tu cita?»**.
3. Si responde **sí** a agendar, muestra fechas y horarios. Si esa segunda pregunta queda sin respuesta por **3 minutos**, envía una sola invitación con las siguientes fechas y sus horarios de atención. Se puede configurar a 2 minutos.
4. La respuesta del cliente cancela el temporizador anterior. Si hace una pregunta y el bot vuelve a preguntar por agendamiento, comienza una nueva espera. «No», asesor, detener y las consultas de SIMIT/ocupacionales cancelan el seguimiento. No se repite después de enviar el recordatorio.
5. Solicita fecha, horario aproximado, nombre, documento, teléfono y correo. Permite corregir un dato conservando los demás.
6. Envía una **solicitud de cita** mediante el Google Apps Script existente. La confirmación de disponibilidad corresponde al centro: este repositorio no incluye una agenda de cupos.

Los exámenes ocupacionales se remiten al comercial **313 401 0901**, [WhatsApp comercial](https://wa.me/573134010901). SIMIT, multas y comparendos reciben una explicación amable del alcance del canal. Las consultas automáticas de RUNT/SIMIT permanecen inactivas.

Un asesor que contesta en Chatwoot pausa el bot. El cliente puede escribir **menú** para retomarlo; ya no se reactiva por un temporizador de inactividad del asesor.

## Ejecutar y verificar

Usa Node.js 22 o 24 y npm. En local, copia `.env.example` a `.env` y completa tus valores; en alojamiento, usa las variables del servicio. No subas credenciales al repositorio.

```bash
npm ci
npm run check
npm test
node --env-file=.env scripts/check-config.js chatwoot
node --env-file=.env src/server.js
```

Si el entorno ya inyecta las variables, usa `npm start` y `npm run doctor -- chatwoot`. El diagnóstico imprime nombres y estados, nunca valores secretos, y no llama proveedores. Acepta `chatwoot`, `twilio` o `meta` según la entrada utilizada.

## Configuración de webhooks

El modo predeterminado es `WEBHOOK_AUTH_MODE=strict`.

| Entrada | Ruta | Configuración necesaria |
| --- | --- | --- |
| Chatwoot (habitual con Twilio) | `POST /webhook/chatwoot` | `CHATWOOT_WEBHOOK_TOKEN`, cuenta e inbox correctos. Configura la URL con `?token=TU_TOKEN`; admite también `x-webhook-token` si tu instalación permite ese encabezado. Suscribe `message_created`. |
| Twilio directo | `POST /webhook/twilio` | `TWILIO_AUTH_TOKEN` y `PUBLIC_URL` iguales a la URL pública utilizada por Twilio para validar `X-Twilio-Signature`. |
| Meta directo, opcional | `POST /webhook` y `GET /webhook` | `WHATSAPP_APP_SECRET` para firma, `VERIFY_TOKEN` para verificación, token, número y versión de API. |

Chatwoot utiliza Twilio para enviar al cliente. Por tanto, necesita también las credenciales de salida de Twilio. Las notas privadas y los mensajes del propio bot no disparan respuestas. Se filtran cuenta y bandeja antes de procesar.

Configura los secretos de webhook antes de cambiar la versión en producción. Un secreto ausente responde 503 y uno incorrecto, 403. `WEBHOOK_AUTH_MODE=compat` admite temporalmente una entrada sin secreto configurado; cuando existe un secreto, siempre lo valida. Usa `strict` en producción. El modo compatible no se activa automáticamente.

## Respuestas y recordatorio

- `src/services/knowledge.js`: catálogo de respuestas y datos del negocio.
- `src/services/answers.js`: reglas locales y clasificación opcional con Groq.
- `src/services/agendaReminders.js`: espera cancelable de 3 minutos (`CRC_AGENDA_REMINDER_MINUTES=2` o `3`; `CRC_AGENDA_REMINDER_ENABLED=false` lo desactiva).
- `src/utils/agenda.js`: fechas, festivos y franjas en `America/Bogota`. Lunes a viernes 7:00–15:30; sábados 7:00–11:30, según el proyecto existente.
- [Plantillas y ejemplos](docs/plantillas.md).

La IA identifica únicamente una intención del catálogo con confianza mínima de 0,85. La respuesta final sale del catálogo: no se usa texto libre generado para precios, pagos, resultados ni promesas. Antes de consultar Groq se omiten correos, enlaces y secuencias numéricas largas. Los datos esperados del formulario se procesan localmente. La sanitización no equivale a una anonimización perfecta de cualquier frase libre.

Twilio utiliza Quick Reply y List Picker dentro de la conversación. Si falla un componente interactivo, intenta enviar el contenido completo como texto, dividido si es necesario. Estas plantillas internas no son campañas ni equivalen a plantillas de marketing aprobadas por Meta.

## Integraciones existentes

**Correo:** el Apps Script, que no está incluido en este repositorio, debe aceptar un POST JSON con `apiKey`, `adminEmail` y `datos`. Estos últimos incluyen `nombre`, `cedula`, `telefono`, `correo`, `tramite`, `dia`, `horario`, `fechaISO` y `solicitudId`. Debe responder JSON `{"ok":true}` al aceptar el envío. Tiene 20 segundos de espera. La referencia permite al equipo revisar un envío dudoso; la idempotencia persistente debe implementarse también en el Apps Script si se necesita. Ante fallo o respuesta ambigua se deriva el caso al asesor.

**Estadísticas:** con `DATABASE_URL` se conservan en PostgreSQL; sin ella funcionan en memoria y se reinician con el proceso. La validación del certificado TLS remoto queda activada por defecto; utiliza la configuración SSL del proveedor. `PG_SSL_REJECT_UNAUTHORIZED=false` conserva compatibilidad únicamente si tu instalación requiere expresamente omitir esa comprobación. Los parámetros SSL incluidos en la propia URL son interpretados por `pg`; evita configuraciones contradictorias.

**Sesiones y recordatorios:** siguen en memoria, incluso si las estadísticas usan PostgreSQL. Requieren una sola instancia activa y un servicio que no se suspenda. Un reinicio pierde los formularios, pausas y temporizadores pendientes. Para varios procesos o recuperación tras reinicios hace falta un almacén compartido y una cola persistente. El recordatorio no se recupera ni se envía horas después de un reinicio.

## Panel y rutas

| Ruta | Uso |
| --- | --- |
| `GET /health` | Proceso y presencia de configuración; no comprueba conectividad real de proveedores. |
| `GET /`, `GET /dashboard` | Panel con usuario y contraseña `DASHBOARD_USER` / `DASHBOARD_PASS`. |
| `GET /api/stats` | Métricas y filtros, con la misma autenticación. |
| `GET /sede-crc`, `GET /media/fachada.jpg` | Referencia visual pública de la sede. |

El panel diferencia mensajes, solicitudes de cita, derivaciones al asesor y entradas no comprendidas. Escapa el texto de las interacciones, valida rangos de fechas y muestra los fallos de carga. Si falla PostgreSQL muestra los eventos conservados en memoria como datos parciales.

## Validación antes de producción

Las pruebas automatizadas no envían WhatsApp, correos ni notas a clientes. Sustituyen los proveedores para verificar el comportamiento y sus fallos. [Auditoría, cambios y alcance de las pruebas](docs/auditoria-2026-09-08.md).

Después de configurar un entorno de pruebas, comprueba con un número controlado: una conversación real, botones, recordatorio de 3 minutos, cancelación al responder, pausa del asesor, una solicitud por correo y persistencia de estadísticas. Verifica también precios, horarios, medios de pago y Apps Script con el centro. Conserva la versión anterior para revertir si falla esa prueba.
