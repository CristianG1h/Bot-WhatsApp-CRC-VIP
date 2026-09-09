# Auditoría del bot CRC VIP

Revisión iniciada el **8 de septiembre de 2026**, cerrada el 9 de septiembre. Base revisada: `3d6be43161d276d050300d9b95ff1acb10aea64f` de `CristianG1h/Bot-WhatsApp-CRC-VIP`. Entrega en rama `audit/respuestas-septiembre-2026`.

## Alcance y resultado

Se revisaron los archivos propios del repositorio: servidor, rutas, servicios, utilidades, panel HTML/CSS/JavaScript, documentación, dependencias y referencia de imagen. Se analizaron las cinco hojas mensuales del Excel suministrado para identificar dudas y problemas de respuesta. Se corrigieron fallos reproducibles y se incorporaron pruebas del flujo y de las entradas HTTP. No se modificó el archivo Excel ni se incluyeron conversaciones, identificaciones o correos de clientes en el repositorio.

El código queda preparado para revisión y validación con las integraciones del centro. Las pruebas locales usan proveedores simulados: **no certifican el funcionamiento en producción**, la recepción real en WhatsApp o el envío real del Apps Script. Tampoco prueban cupos, porque no existe una agenda de reservas en el código recibido.

## Evidencia del histórico

| Hoja | Registros | Mensajes de cliente | Conversaciones presentes |
| --- | ---: | ---: | ---: |
| MAYO_2026 | 806 | 342 | 28 |
| JUNIO_2026 | 107 | 48 | 9 |
| JULIO_2026 | 1.556 | 651 | 81 |
| AGOSTO_2026 | 1.064 | 503 | 54 |
| SEPTIEMBRE_2026 | 151 | 76 | 9 |
| Total | **3.684** | **1.620** | **163 distintas** |

Las conversaciones pueden aparecer en varios meses: no se suman las cifras mensuales para obtener el total distinto. Se revisaron identificadores de conversación/mensaje para evitar contar duplicados. El corte corresponde al Excel exportado el 8 de septiembre, no al mes completo.

Hay 1.857 notas privadas; 1.797 llevan el marcador explícito de respuesta del bot. Otras filas contienen mensajes salientes o eventos de sistema. No es correcto interpretar todas esas filas como respuestas nuevas al cliente. Se encontraron **146 registros** que mencionan actividad reciente del asesor, compatibles con el antiguo mecanismo de reactivación. No equivalen a 146 clientes perdidos.

Los patrones que orientaron los cambios fueron: duración confundida con tarifa; precio del examen confundido con licencia completa; dudas sobre cita previa, horario exacto, ubicación y dos categorías; consultas de primera licencia; vigencia/cargue del certificado; medios de pago; ocupacionales y comparendos. Se usaron ejemplos sin datos personales para las pruebas. El histórico contiene versiones anteriores y por sí solo no demuestra que cada problema siga ocurriendo en la versión desplegada.

## Hallazgos y correcciones

| Prioridad | Hallazgo | Cambio y efecto |
| --- | --- | --- |
| Alta | Varios middleware interpretaban y respondían al mismo mensaje con filtros diferentes. | Una entrada normalizada, filtros de cuenta/bandeja, deduplicación y cola por teléfono. |
| Alta | Webhooks sin autenticación de origen. | Firma de Twilio, HMAC de Meta y token de Chatwoot; modo estricto por defecto. |
| Alta | Reentrada del bot después de inactividad del asesor. | Pausa hasta un «menú» explícito; comando asesor disponible durante todo el flujo. |
| Alta | IA podía responder texto libre sin respetar confianza. | Solo clasificación de intenciones conocidas, mínimo 0,85, respuesta desde catálogo y fallo no bloqueante. |
| Alta | Una solicitud por correo se presentaba como cita confirmada. | Confirmación explícita del Apps Script, referencia y texto «Solicitud de cita enviada». Fallo o timeout deriva al asesor. |
| Alta | Números de opciones podían cambiar de significado al pasar el tiempo. | Se guardan las fechas/franjas ofrecidas y se revalida la selección y la confirmación. |
| Alta | Texto de interacciones insertado como HTML en el panel. | Escape de contenido antes de insertarlo; prueba con texto que contiene etiquetas y atributos. |
| Media | «Cuánto demora» podía activar precio por coincidencia de «cuánto». | Intenciones separadas; duración y precio tienen casos de regresión. |
| Media | Botones de Twilio y tipos numéricos de Chatwoot mal interpretados. | Prioridad a ButtonPayload, aceptación de tipos 0/1 y separación de asesor/bot. |
| Media | Esperas externas sin límite y mensajes fallidos contados como enviados. | Timeouts, errores controlados, estadísticas posteriores a aceptación y salida al asesor. |
| Media | Mensajes largos o interactivos podían recortarse. | División preservando emojis y respaldo completo en texto. |
| Media | Notas pendientes de Chatwoot se perdían parcialmente o podían demorar la respuesta. | Conservación de pendientes tras fallo y vinculación de conversación sin esperar a vaciarlas. |
| Media | Filtros ignorados en memoria y contador incorrecto de no reconocidos. | Filtros reales en memoria, rango validado y campo correcto en panel. |
| Media | PostgreSQL remoto omitía por defecto validar el certificado TLS. | Validación por defecto; compatibilidad explícita documentada para instalaciones que la requieran. |
| Media | Dependencias sin uso y vulnerabilidades reportadas. | Retiro de nodemailer, playwright y tesseract.js; actualización de dependencias y lockfile. |

El control de duplicados y la cola evitan la doble confirmación dentro de un proceso. No proporcionan idempotencia distribuida ni garantizan entrega exactamente una vez frente a reinicios, fallos ambiguos de red o varios procesos.

## Requisitos nuevos aplicados

- **Ocupacionales:** redirección al **313 401 0901** y `https://wa.me/573134010901`, también en el primer mensaje. Se evita confundir el nombre de la marca «VIP Salud Ocupacional» con una solicitud ocupacional.
- **SIMIT/comparendos/multas:** explica que el canal pertenece al CRC y no dispone de información o consultas de SIMIT. No promete consultar ni solicita documentos para hacerlo.
- **Seguimiento:** conserva «¿Deseas agendar tu cita?» tras el interés en renovar. Después de **3 minutos de silencio**, comparte una sola vez próximas fechas y horarios. Configurable a 2 minutos; se cancela con respuesta, asesor, detener o redirección a otro servicio. Si una FAQ termina con la pregunta de agenda, empieza una nueva espera.

## Limpieza y compatibilidad

Se retiraron `aiFallback.js`, `chatwootContext.js` y `habilitacionMiddleware.js` al integrar sus responsabilidades en una ruta común; `mediaHooks.js` y `twilioFacade.js` eran envoltorios/automatismos de envío de imágenes duplicados. Se eliminaron el temporizador que reactivaba la atención y el selector de fechas que recalculaba opciones antiguas. La foto y la página pública de referencia de sede se conservan.

RUNT, SIMIT, OCR y lectura de archivos no se reactivan: el usuario indicó que algunas funciones están ausentes deliberadamente. Los campos históricos de estadísticas se mantienen por compatibilidad de datos; el panel muestra las acciones actuales. El módulo de correo sigue usando Apps Script, por lo que retirar nodemailer no elimina el envío actual.

## Verificación

La comprobación de sintaxis cubre todos los JavaScript propios en `src`, `scripts` y `test`. La suite incluye reglas de respuesta, protección de datos esperados del formulario, clasificación inválida/baja confianza, fechas inválidas y festivos, horas fuera de atención, opciones antiguas, corrección de datos, doble confirmación, asesor, recordatorio con reloj simulado, firmas HTTP, filtros, panel y fallos de transporte/correo/notas.

El panel se verificó mediante pruebas HTTP y ejecución de su JavaScript con DOM simulado, incluido el fallo de sus librerías opcionales. No se completó una revisión visual en navegador: el entorno no tenía Chromium y su descarga no estuvo disponible. El flujo de CI queda configurado para Node 22 y 24; la ejecución local se hizo en Node 24. Resultado local: **74 pruebas aprobadas, 0 fallos**; **34 archivos JavaScript sin errores de sintaxis**. La instalación limpia con `npm ci --ignore-scripts` permite ejecutar la suite. `npm audit --omit=dev` reportó **0 vulnerabilidades** al cierre, frente a 5 en la revisión inicial (3 altas, 1 moderada y 1 baja). Este resultado depende de la base de avisos disponible al ejecutar npm y no sustituye futuras revisiones.

## Condiciones pendientes de producción

1. Configurar secretos de webhook antes de actualizar el servicio y comprobar que la cuenta/inbox coincidan. El modo estricto rechaza entradas sin configuración.
2. Probar Twilio/Chatwoot y una solicitud de correo con un contacto controlado; verificar contrato y destinatarios del Apps Script.
3. Confirmar tarifas, horarios y disponibilidad comercial. Se conservaron $180.000/$250.000 para renovación y la jornada existente, sin trasladar tarifas históricas del Excel a producción automáticamente.
4. Comprobar conexión PostgreSQL y su configuración TLS. La base real no estuvo disponible durante esta revisión; los cambios no borran sus tablas.
5. Mantener una sola instancia activa sin suspensión para el recordatorio. Sesiones, pausa humana y temporizadores siguen en memoria: se pierden al reiniciar, aunque las estadísticas estén en PostgreSQL. La persistencia de sesiones/cola requiere una ampliación posterior.
6. Confirmar en un teléfono real botones, listas, textos y vista móvil del panel. Para Meta directo, verificar versión configurada y permisos en su aplicación; la integración principal revisada es Twilio.

## Referencias técnicas

La interpretación de `ButtonPayload` y la verificación de firma siguen la documentación de [webhooks de Twilio](https://www.twilio.com/docs/messaging/guides/webhook-request) y [seguridad de webhooks](https://www.twilio.com/docs/usage/webhooks/webhooks-security). La clasificación opcional utiliza la [API de Groq](https://console.groq.com/docs/api-reference), con validación local de su JSON. El enlace de acreditación se dirige al [directorio oficial de ONAC](https://onac.org.co/directorio3/index.php/acreditaciones/22-CEP-076); no se confunde con el certificado de un paciente ni se afirma un vencimiento no verificado.
