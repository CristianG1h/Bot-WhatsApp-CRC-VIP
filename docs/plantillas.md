# Plantillas de atención CRC

Revisión iniciada el 8 de septiembre de 2026. Estos textos se utilizan dentro de una conversación iniciada por el cliente; no se ha solicitado aprobación de nuevas campañas a Twilio/Meta. La fuente del catálogo es `src/services/knowledge.js`. Los importes y horarios conservan los del proyecto actual y deben validarse comercialmente.

## Secuencia de renovación

1. **Interés:** «¿Estás interesado(a) en renovar tu licencia de conducción?»
2. **Después del sí:** tarifa del examen + dirección/Maps + «¿Deseas agendar tu cita?» con Sí/No.
3. **Después del sí a agendar:** siguientes fechas y sus horarios; luego franjas del día elegido.
4. **Si no responde a la segunda pregunta:** a los **3 minutos**, una sola vez: «Si te queda más fácil, elige directamente una de estas fechas con horario disponible 👇», seguido de las fechas y horarios calculados en ese momento.

El recordatorio permite elegir las opciones 1, 2 u «Otro día». No pide nuevamente si desea agendar. Al seleccionar una fecha, muestra las franjas de ese día. Si contesta, pide asesor, elige no o consulta SIMIT/ocupacionales, se cancela el temporizador anterior. Una pregunta intercalada puede iniciar una nueva espera si la respuesta del bot vuelve a preguntar por agendamiento.

Los horarios son de atención, sujetos a confirmación del centro; no representan cupos consultados a un calendario. No se envían recordatorios después de confirmar una solicitud ni durante la atención humana.

## Catálogo operativo

### ocupacional

> 🏥 Para *exámenes médicos ocupacionales*, nuestro equipo comercial te ayudará con información y agendamiento.
> 📞 *313 401 0901*
> 💬 Escríbenos por WhatsApp: https://wa.me/573134010901
>
> Este chat atiende el examen CRC para trámites de licencia de conducción.

### simit

> Gracias por escribirnos. Este canal es de *VIP CRC Galerías*, Centro de Reconocimiento de Conductores. Aquí te orientamos sobre el *examen CRC para renovar o tramitar tu licencia de conducción*.
>
> No contamos con información ni consultas de *SIMIT, multas o comparendos* en este chat. Si necesitas el examen CRC, escribe *renovar* y te mostramos las fechas y horarios disponibles.

### precios

> 💰 El *examen CRC para renovación/refrendación* cuesta *$180.000* para una categoría y *$250.000* para dos categorías.
> Estos valores corresponden al examen CRC; los derechos del organismo de tránsito y el curso de conducción se pagan aparte.

### primera_vez

> Realizamos el *examen CRC para primera licencia*. El CRC no es una escuela de conducción ni expide la licencia final.
> Un asesor debe confirmar la tarifa y las categorías de tu caso.

### duracion

> ⏱️ El examen CRC suele tomar *40 a 60 minutos*, según el flujo de atención. La hora solicitada es aproximada y queda sujeta a confirmación del centro.

### horarios

> 🕒 Lunes a viernes: *7:00 a.m. a 3:30 p.m.*
> Sábados: *7:00 a.m. a 11:30 a.m.*
> Domingos y festivos: *no laboramos*.

### ubicacion

> 📍 *VIP CRC Galerías*
> Cra. 28A #51-70, barrio Galerías – Bogotá
> Cómo llegar: https://share.google/G0KaXb0OWp0MbqYOc
> 🚗 Contamos con parqueadero.

### parqueadero

> 🚗 Sí, contamos con parqueadero en *VIP CRC Galerías*.

### sin_cita

> Atendemos por *orden de llegada*, según la disponibilidad del centro. Para organizar tu atención puedes solicitar una fecha y un horario aproximado por este chat. La hora final la confirma el equipo.

### pagos

> Para confirmar si puedes pagar con tarjeta, efectivo, Nequi u otro medio, escribe *asesor*. Así verificamos el medio disponible antes de que asistas.

### requisitos

> Para asistir al CRC, trae tu *documento de identidad físico original*. Si usas gafas o tienes una condición que pueda afectar la evaluación, coméntalo al asesor para confirmar las indicaciones de tu caso.

### proceso

> 1. Solicitas fecha y horario.
> 2. Registramos tus datos y enviamos la solicitud al centro.
> 3. El centro confirma la disponibilidad.
> 4. Asistes con tu documento físico original.
> El CRC realiza la evaluación de aptitud; la expedición de la licencia corresponde al organismo de tránsito.

### licencia_final

> El CRC realiza el *examen y la certificación de aptitud*. La licencia como documento final la expide el organismo de tránsito. El valor del examen no incluye ese trámite.

### escuela

> Este canal corresponde al *CRC*, donde realizamos el examen de aptitud para conducir. Para el curso de conducción o su precio necesitas una escuela de conducción; un asesor puede orientarte.

### consulta_externa

> En este chat te ayudamos con información del *examen CRC* y solicitudes de atención. No tenemos una consulta automática de RUNT para confirmar el estado o resultado de tu licencia.

### vigencia

> La vigencia del certificado o los plazos de un trámite deben verificarse para tu caso. Escribe *asesor* y te orientamos sin darte una fecha que pueda ser incorrecta.

### certificado_personal

> Si ya realizaste el examen y necesitas tu certificado o revisar su cargue, escribe *asesor*. El equipo debe revisar tu caso; este chat no confirma el resultado ni el cargue automático.

### acreditacion

> 📄 Puedes consultar la acreditación del centro *22-CEP-076* en el directorio oficial de ONAC:
> https://onac.org.co/directorio3/index.php/acreditaciones/22-CEP-076
> Certificado del centro: https://onac.org.co/directorio3/index.php/acreditaciones/pdf/22-CEP-076

### cita_existente

> Para cambiar, cancelar o confirmar una cita ya solicitada, escribe *asesor*. El equipo revisará tu solicitud; este chat no modifica una reserva existente automáticamente.

### identidad

> Somos *VIP CRC Galerías*, Centro de Reconocimiento de Conductores en Bogotá. Te ayudamos con información del examen CRC y solicitudes de atención.

## Salidas útiles

- Una pregunta por duración recibe 40–60 minutos, sin confundirse con precio.
- Precio de renovación distingue el examen CRC de derechos de tránsito y curso. Primera vez requiere confirmar la tarifa.
- Certificado de un paciente se deriva al equipo; acreditación del centro remite a ONAC.
- Sin correo: se ofrece atención humana.
- Audio/archivo: se solicita texto o asesor; no se afirma haber leído el adjunto.
- Tres entradas no comprendidas en los pasos generales llevan al asesor; los campos del formulario conservan validación específica.
- Tras el correo aceptado: «Solicitud de cita enviada», con referencia y aclaración de que el centro confirma la disponibilidad.

## Cómo ampliar sin inventar información

Agrega un texto aprobado al catálogo, su regla a `localIntents` y un ejemplo anonimizado a `test/answers.test.js`. Si modifica un paso de agenda, verifica también `test/flow.test.js`. El clasificador solo puede elegir identificadores del catálogo; no redacta precios ni afirmaciones libres para el cliente.
