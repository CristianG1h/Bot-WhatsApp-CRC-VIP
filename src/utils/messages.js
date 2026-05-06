function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

const precios = [
  `💥 *Promoción especial por esta semana en VIP CRC Galerías*  

🚗🏍️ Curso para *una categoría*: antes $240.000  
✅ Esta semana solo pagas *$180.000*  

Aplica para moto o carro, sin importar si es categoría A, B1 o C1.  

🚗 + 🏍️ Curso para *dos categorías*: antes $320.000  
✅ Esta semana solo pagas *$250.000*  

Es una excelente oportunidad para hacer tu trámite completo y ahorrar dinero esta semana. 🙌`,

  `🔥 *Aprovecha el descuento de esta semana*  

En VIP CRC Galerías tenemos precio especial para que realices tu curso sin pagar de más.  

✅ *Una categoría:* $180.000  
Precio normal: $240.000  

✅ *Dos categorías:* $250.000  
Precio normal: $320.000  

El valor aplica igual para moto, carro, B1 o C1. Lo importante es que puedas avanzar rápido con tu licencia. 🚦`,

  `🚦 *Precios del curso con descuento activo*  

Por esta semana tenemos una promoción especial:  

🏍️🚗 *Una sola categoría:*  
Antes $240.000 → ahora *$180.000*  

🚗🏍️ *Dos categorías, moto y carro:*  
Antes $320.000 → ahora *$250.000*  

Es un descuento temporal, ideal si quieres hacer el trámite pronto y dejar todo listo. ✅`,

  `✅ *Curso para licencia con precio especial*  

Esta semana puedes realizar tu curso con un super descuento:  

1️⃣ Una categoría: *$180.000*  
Precio normal: $240.000  

2️⃣ Dos categorías: *$250.000*  
Precio normal: $320.000  

Aplica para moto o carro. No importa si es B1, C1 o categoría de moto, el valor se mantiene igual. 🙌`,

  `🎉 *Tenemos promoción por tiempo limitado*  

Si vas a realizar el curso para licencia, esta semana te queda más económico:  

🚗 Una categoría: *$180.000*  
🏍️ Dos categorías: *$250.000*  

Los precios normales son $240.000 y $320.000, así que esta semana puedes ahorrar bastante.  

Te recomendamos aprovecharlo mientras está activo el descuento. ✅`
];

const duracion = [
  `⏱️ *Duración aproximada del proceso*  

El proceso normalmente dura alrededor de *1 hora*.  

En algunos casos puede tardar hasta *1 hora y media*, dependiendo del rendimiento de cada persona y del flujo de atención.  

La idea es que realices todo de forma ordenada, rápida y sin complicaciones. ✅`,

  `🕐 *Tiempo estimado del trámite*  

El proceso suele tardar aproximadamente *una hora*.  

Si hay mayor demanda o necesitas más tiempo en alguna evaluación, puede extenderse hasta *una hora y media*.  

Nuestro equipo te acompaña para que avances de la mejor manera. 🙌`,

  `⏳ *¿Cuánto demora el proceso?*  

Generalmente el trámite completo toma cerca de *1 hora*.  

En algunos casos puede durar hasta *1 hora y 30 minutos*, según tu rendimiento durante las evaluaciones.  

Te recomendamos venir con disponibilidad suficiente para hacerlo tranquilo. ✅`,

  `🚦 *Duración del examen y proceso*  

El tiempo promedio es de aproximadamente *una hora*.  

Puede variar un poco según la agilidad del candidato y el flujo de atención del momento.  

Como máximo, normalmente puede tomar cerca de *una hora y media*. ⏱️`,

  `✅ *Tiempo aproximado de atención*  

El proceso es bastante ágil. Normalmente dura *1 hora*.  

En algunos casos puede tomar hasta *1 hora y media*, dependiendo del desempeño en las áreas evaluadas.  

Nuestro objetivo es atenderte rápido, pero con un proceso completo y seguro. 🙌`
];

const horarios = [
  `🕒 *Horarios de atención VIP CRC Galerías*  

📅 Lunes a viernes:  
⏰ 7:00 a.m. a 3:30 p.m.  
Jornada continua  

📅 Sábados:  
⏰ 7:00 a.m. a 11:30 a.m.  

Puedes asistir dentro de estos horarios y con gusto te orientamos en el proceso. ✅`,

  `📆 *Nuestro horario de atención*  

Atendemos en jornada continua:  

✅ Lunes a viernes: 7:00 a.m. a 3:30 p.m.  
✅ Sábados: 7:00 a.m. a 11:30 a.m.  

Te recomendamos venir con tiempo para realizar el proceso completo sin afanes. 🙌`,

  `⏰ *Horario VIP CRC Galerías*  

Estamos disponibles para ayudarte en estos horarios:  

📌 Lunes a viernes: 7:00 a.m. a 3:30 p.m.  
📌 Sábados: 7:00 a.m. a 11:30 a.m.  

Trabajamos en jornada continua para que puedas realizar tu trámite más fácil. ✅`,

  `🗓️ *Puedes visitarnos en estos horarios*  

De lunes a viernes atendemos desde las *7:00 a.m. hasta las 3:30 p.m.*  

Los sábados atendemos desde las *7:00 a.m. hasta las 11:30 a.m.*  

Te esperamos en VIP CRC Galerías para ayudarte con tu licencia. 🚦`,

  `✅ *Horario de atención al público*  

📍 VIP CRC Galerías  

Lunes a viernes: *7:00 a.m. a 3:30 p.m.*  
Sábados: *7:00 a.m. a 11:30 a.m.*  

Manejamos jornada continua para que puedas realizar el trámite de forma más cómoda. 🙌`
];

const pagos = [
  `💳 *Medios de pago disponibles*  

Puedes pagar de la forma que más fácil te quede:  

💵 Efectivo  
💳 Tarjeta débito o crédito  
🏦 Transferencia a Bancolombia  
🏦 Transferencia a Davivienda  
📲 Nequi  
📲 Daviplata  

Tenemos varias opciones para que puedas realizar tu trámite sin complicaciones. ✅`,

  `✅ *Formas de pago en VIP CRC Galerías*  

Recibimos diferentes medios de pago:  

💵 Efectivo  
💳 Tarjeta  
🏦 Bancolombia  
🏦 Davivienda  
📲 Nequi  
📲 Daviplata  

Puedes escoger el medio que prefieras al momento de realizar tu proceso. 🙌`,

  `💰 *Puedes pagar como prefieras*  

En VIP CRC Galerías aceptamos:  

✅ Efectivo  
✅ Tarjeta  
✅ Transferencia Bancolombia  
✅ Transferencia Davivienda  
✅ Nequi  
✅ Daviplata  

La idea es facilitarte el trámite y que no tengas inconvenientes al pagar. 🚦`,

  `📲 *Medios de pago habilitados*  

Para tu comodidad, contamos con varias opciones:  

💵 Pago en efectivo  
💳 Pago con tarjeta  
🏦 Transferencia bancaria a Bancolombia o Davivienda  
📲 Pago por Nequi o Daviplata  

Así puedes realizar tu proceso de manera más rápida y cómoda. ✅`,

  `🙌 *Opciones de pago disponibles*  

Puedes cancelar tu trámite por cualquiera de estos medios:  

💵 Efectivo  
💳 Tarjeta  
🏦 Bancolombia  
🏦 Davivienda  
📲 Nequi  
📲 Daviplata  

Todos son medios válidos para iniciar tu proceso en VIP CRC Galerías. ✅`
];

const proceso = [
  `🚦 *Proceso del examen en VIP CRC Galerías*  

Durante tu atención se realizan 4 áreas principales:  

👁️ Optometría  
👂 Audiometría  
🧠 Psicología  
🩺 Medicina general  

Después se genera la certificación correspondiente.  

✅ Nosotros subimos la información de manera inmediata a la plataforma RUNT.  

Si deseas, también te colaboramos sacando la cita con tránsito para continuar el trámite de tu licencia. 🙌`,

  `✅ *Así es el proceso para tu licencia*  

El examen se realiza en varias áreas:  

1️⃣ Optometría  
2️⃣ Audiometría  
3️⃣ Psicología  
4️⃣ Medicina general  

Al finalizar, se realiza la certificación y cargamos el resultado directamente al RUNT.  

También podemos ayudarte a solicitar la cita con tránsito si lo necesitas. 🚗🏍️`,

  `📝 *Proceso completo del CRC*  

En VIP CRC Galerías realizamos las evaluaciones necesarias para tu trámite:  

👁️ Optometría  
👂 Audiometría  
🧠 Psicología  
🩺 Medicina general  

Luego generamos la certificación y la subimos de forma inmediata al RUNT.  

Si quieres, te orientamos para agendar tu cita en tránsito y continuar el proceso. ✅`,

  `🚗🏍️ *Paso a paso del proceso*  

Cuando asistes al CRC, pasas por estas áreas:  

✅ Optometría  
✅ Audiometría  
✅ Psicología  
✅ Medicina general  

Después se emite la certificación y se carga inmediatamente en la plataforma RUNT.  

Además, podemos colaborarte con la cita de tránsito para que sigas con el trámite de la licencia. 🙌`,

  `📋 *¿Qué incluye el proceso?*  

Tu trámite incluye evaluación en:  

👁️ Optometría  
👂 Audiometría  
🧠 Psicología  
🩺 Medicina general  

Una vez finalizado, hacemos la certificación y la subimos directamente al RUNT.  

Si deseas apoyo adicional, también te ayudamos a gestionar la cita con tránsito. ✅`
];

const ubicacion = [
  `📍 *Nuestra ubicación*  

*CRC VIP Salud*  
Cra. 28A #51-70, Bogotá  

Estamos ubicados en una zona de fácil acceso para que puedas realizar tu proceso de manera cómoda.  

🗺️ Google Maps:  
https://maps.app.goo.gl/bJ8qJ91jWpmyAmHj7`,

  `📌 *Te esperamos en VIP CRC Galerías*  

Dirección:  
Cra. 28A #51-70, Bogotá  

Puedes llegar fácilmente usando Google Maps.  

🗺️ Ubicación:  
https://maps.app.goo.gl/bJ8qJ91jWpmyAmHj7`,

  `🚦 *Ubicación del CRC*  

Estamos en:  

📍 CRC VIP Salud  
Cra. 28A #51-70, Bogotá  

Ven dentro de nuestro horario de atención y con gusto te ayudamos con el trámite.  

🗺️ https://maps.app.goo.gl/bJ8qJ91jWpmyAmHj7`,

  `✅ *Dónde estamos ubicados*  

Nos encuentras en:  

📍 CRC VIP Salud  
Cra. 28A #51-70, Bogotá  

Es una ubicación práctica para realizar tu proceso de licencia.  

Abrir en Maps:  
https://maps.app.goo.gl/bJ8qJ91jWpmyAmHj7`,

  `📍 *Dirección VIP CRC Galerías*  

CRC VIP Salud  
Cra. 28A #51-70, Bogotá  

Puedes venir directamente en nuestros horarios de atención.  

Te dejamos el mapa para que llegues más fácil:  
https://maps.app.goo.gl/bJ8qJ91jWpmyAmHj7`
];

const comparendoNo = [
  `Perfecto ✅

Entonces vamos a revisar tu información en RUNT para validar el estado de tu licencia y orientarte con el trámite correcto.

Por favor envíame tu número de cédula.`,

  `Excelente ✅

Si no tienes comparendos pendientes, podemos avanzar revisando tu licencia en RUNT.

Envíame por favor tu número de cédula.`,

  `Muy bien ✅

Vamos a validar tu información en RUNT para saber cómo podemos ayudarte con tu trámite.

Por favor envíame tu número de cédula.`,

  `Listo ✅

Continuemos con la revisión en RUNT para confirmar el estado de tu licencia.

Envíame tu número de cédula sin puntos ni espacios.`,

  `Perfecto, podemos avanzar ✅

Para revisar tu estado en RUNT y orientarte correctamente, por favor envíame tu número de cédula.`
];

const comparendoNoSeguro = [
  `Tranquilo ✅ Eso es muy común.

Podemos avanzar revisando primero tu información en RUNT y, si es necesario, también te orientamos para validar en SIMIT si aparece algún comparendo pendiente.

Por favor envíame tu número de cédula.`,

  `No te preocupes ✅

Primero revisamos tu información en RUNT y con eso podemos orientarte mejor sobre el proceso.

Envíame tu número de cédula.`,

  `Está bien ✅

Muchas personas no recuerdan si tienen comparendos activos. Vamos a revisar primero tu información en RUNT para continuar con el trámite.

Por favor envíame tu cédula.`,

  `Sin problema ✅

Podemos validar tu información en RUNT y, si aparece algo pendiente, te orientamos con el paso a seguir.

Envíame tu número de cédula.`,

  `Tranquilo, para eso te orientamos ✅

Vamos a revisar tu información en RUNT y así sabremos cómo avanzar con tu trámite.

Por favor envíame tu número de cédula.`
];

const simitSolicitarDocumento = [
  `Entiendo ✅

Para validar mejor tu caso, primero vamos a consultar en SIMIT si tienes comparendos o multas registradas.

Por favor envíame tu número de cédula sin puntos ni espacios.`,

  `Perfecto, revisemos primero en SIMIT ✅

Así podemos saber si aparece algún comparendo o multa pendiente antes de continuar con la renovación.

Envíame tu número de cédula.`,

  `Listo ✅

Vamos a consultar SIMIT para orientarte correctamente. Recuerda que si aparece una multa, normalmente debe pagarse para poder avanzar con el trámite final.

Por favor envíame tu cédula.`,

  `De acuerdo ✅

Primero validamos SIMIT para saber si aparece algún registro pendiente. Si es comparendo, podemos orientarte con el curso; si ya es multa, te explicamos cómo proceder.

Envíame tu número de cédula.`,

  `Muy bien ✅

Para darte una respuesta más precisa, vamos a revisar SIMIT antes de continuar.

Por favor envíame tu número de cédula sin puntos ni espacios.`
];

const simitConsultando = [
  `Estoy consultando SIMIT ✅

Esto puede tardar unos segundos...`,

  `Un momento por favor ✅

Voy a validar la información en SIMIT.`,

  `Estoy revisando si aparece algún comparendo o multa pendiente en SIMIT.

Dame unos segundos ✅`,

  `Listo, voy a consultar SIMIT con la información que me enviaste.

Esto puede tardar un momento ✅`,

  `Estoy verificando el estado en SIMIT para orientarte mejor.

Por favor espera unos segundos ✅`
];

const simitConPendientes = [
  `Según la consulta, aparece información pendiente en SIMIT.

Te explico de forma sencilla:

✅ Si es *comparendo* y todavía aplica descuento, nosotros podemos orientarte con el curso.
⚠️ Si ya aparece como *multa o resolución*, normalmente debes realizar el pago para poder continuar con el trámite final de la licencia.

De todas formas, el examen médico del CRC tiene una vigencia de *6 meses*, así que puedes adelantar esa parte y dejarla lista mientras solucionas lo pendiente.

¿Qué deseas hacer?

1️⃣ Hablar con un asesor para comparendos
2️⃣ Seguir con la consulta de renovación en RUNT`,

  `Encontramos registros en SIMIT.

No te preocupes, te orientamos:

✅ Cuando todavía es comparendo, podemos ayudarte con la información del curso.
⚠️ Cuando ya está como multa, el pago debe realizarse para poder avanzar con el trámite final.

Aun así, puedes adelantar el examen médico, ya que tiene vigencia de *6 meses*.

¿Cómo deseas continuar?

1️⃣ Quiero asesor para comparendos
2️⃣ Seguir revisando mi renovación en RUNT`,

  `La consulta en SIMIT muestra registros pendientes.

Es importante tenerlo claro:

✅ Si aplica curso por comparendo, podemos orientarte.
⚠️ Si ya es multa, debes pagarla para poder continuar con la renovación ante tránsito.

Pero puedes ir adelantando tu examen médico porque queda vigente por *6 meses*.

Elige una opción:

1️⃣ Asesor para comparendos
2️⃣ Continuar con consulta RUNT`,

  `Aparece información pendiente en SIMIT.

Te podemos ayudar a revisar si todavía aplica curso por comparendo. Si el sistema ya lo muestra como multa, lo correcto es realizar el pago para poder finalizar el trámite.

Mientras tanto, puedes adelantar tu examen médico porque tiene vigencia de *6 meses*.

¿Qué prefieres?

1️⃣ Hablar con asesor de comparendos
2️⃣ Seguir con renovación / RUNT`,

  `Vemos que SIMIT registra información pendiente.

La recomendación es revisar el caso con cuidado:
✅ Comparendo: podemos orientarte con el curso si aplica.
⚠️ Multa: normalmente debe pagarse para continuar el trámite final.

El examen médico lo puedes adelantar y te queda vigente por *6 meses*.

Responde:

1️⃣ Asesor para comparendos
2️⃣ Seguir con consulta RUNT`
];

const simitSinPendientes = [
  `Excelente ✅

No aparecen comparendos ni multas pendientes en SIMIT.

Ahora vamos a continuar revisando tu información en RUNT para validar el estado de tu licencia.`,

  `Muy buena noticia ✅

No registra pendientes en SIMIT.

Continuemos con la revisión en RUNT para orientarte con la renovación.`,

  `Perfecto ✅

SIMIT no muestra comparendos ni multas pendientes.

Ahora seguimos con la consulta en RUNT para revisar el estado de tu licencia.`,

  `Listo ✅

No aparecen registros pendientes en SIMIT.

Voy a continuar con la validación en RUNT para revisar tu trámite.`,

  `Excelente, puedes avanzar ✅

No se evidencian pendientes en SIMIT.

Ahora revisamos RUNT para continuar con tu proceso.`
];

const simitDecisionInvalida = [
  `Por favor responde con una opción:

1️⃣ Hablar con asesor para comparendos
2️⃣ Seguir con consulta de renovación en RUNT`,

  `Para continuar, elige una opción:

1️⃣ Asesor para comparendos
2️⃣ Continuar con RUNT`,

  `No logré identificar tu respuesta.

Responde únicamente:

1️⃣ Comparendos
2️⃣ Renovación / RUNT`,

  `Te ayudo con cualquiera de estas opciones:

1️⃣ Hablar con asesor de comparendos
2️⃣ Seguir revisando la renovación en RUNT`,

  `Por favor selecciona:

1️⃣ Asesor para comparendos
2️⃣ Seguir con consulta RUNT`
];

const asesorComparendos = [
  `Perfecto ✅

Un asesor continuará con tu caso de comparendos.

Por favor déjanos estos datos:

👤 Nombre completo
🪪 Número de cédula
🏙️ Ciudad
📌 Consulta que deseas realizar`,

  `Claro ✅

Te vamos a orientar con el tema de comparendos.

Por favor envíanos:

👤 Nombre completo
🪪 Cédula
📍 Ciudad
📝 Qué deseas revisar`,

  `Listo ✅

Un asesor de comparendos revisará tu caso.

Déjanos por favor:

👤 Nombre
🪪 Cédula
📞 Teléfono de contacto
📌 Motivo de la consulta`,

  `De acuerdo ✅

Para ayudarte con comparendos, por favor envía:

👤 Nombre completo
🪪 Documento
🏙️ Ciudad
📄 Si deseas curso, descuento o revisión de multa`,

  `Perfecto ✅

Te pasamos con asesoría para comparendos.

Por favor escribe:

👤 Nombre completo
🪪 Cédula
📍 Ciudad
📌 Qué necesitas revisar en SIMIT`
];

function getMessage(type) {
  const grupos = {
    precios,
    duracion,
    horarios,
    pagos,
    proceso,
    ubicacion,
    comparendoNo,
    comparendoNoSeguro,
    simitSolicitarDocumento,
    simitConsultando,
    simitConPendientes,
    simitSinPendientes,
    simitDecisionInvalida,
    asesorComparendos,
  };

  return randomItem(grupos[type] || precios);
}

module.exports = { getMessage };
