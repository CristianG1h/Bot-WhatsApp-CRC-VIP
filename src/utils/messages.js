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

// ─────────────────────────────────────────────
// RESPUESTAS RÁPIDAS / FAQ DURANTE EL FLUJO
// ─────────────────────────────────────────────

const FAQ_KEYWORDS = {
  direccion: [
    "direccion",
    "dirección",
    "ubicacion",
    "ubicación",
    "ubicados",
    "ubicado",
    "donde queda",
    "dónde queda",
    "donde estan",
    "dónde están",
    "donde están",
    "donde estan ubicados",
    "dónde están ubicados",
    "donde están ubicados",
    "en donde estan",
    "en dónde están",
    "en donde quedan",
    "en dónde quedan",
    "donde es",
    "dónde es",
    "cual es la direccion",
    "cuál es la dirección",
    "me regalas la direccion",
    "me regalas la dirección",
    "me puedes dar la direccion",
    "me puedes dar la dirección",
    "pasame la direccion",
    "pásame la dirección",
    "necesito la direccion",
    "necesito la dirección",
    "como llego",
    "cómo llego",
    "como llegar",
    "cómo llegar",
    "maps",
    "mapa",
    "google maps",
    "link de ubicacion",
    "link de ubicación",
    "sede",
    "sede galerias",
    "sede galerías",
    "crc galerias donde queda",
    "crc galerías donde queda",
    "vip crc donde queda",
    "me comparte la ubicacion",
    "me comparte la ubicación",
    "por donde queda",
    "por dónde queda",
    "cerca de donde",
    "cerca de dónde",
  ],

  precios: [
    "precio",
    "precios",
    "valor",
    "valores",
    "costo",
    "costos",
    "tarifa",
    "tarifas",
    "cuanto cuesta",
    "cuánto cuesta",
    "cuanto vale",
    "cuánto vale",
    "que vale",
    "qué vale",
    "cuanto es",
    "cuánto es",
    "cuanto cobran",
    "cuánto cobran",
    "me regalas el precio",
    "me regalas los precios",
    "me dices el valor",
    "me dice el valor",
    "cual es el valor",
    "cuál es el valor",
    "cual es el precio",
    "cuál es el precio",
    "que precio tiene",
    "qué precio tiene",
    "tiene costo",
    "tiene algun costo",
    "tiene algún costo",
    "cuanto me sale",
    "cuánto me sale",
    "en cuanto queda",
    "en cuánto queda",
    "promocion",
    "promoción",
    "descuento",
    "oferta",
    "precio promocion",
    "precio promoción",
    "valor promocion",
    "valor promoción",
    "valor renovacion",
    "valor renovación",
    "precio renovacion",
    "precio renovación",
    "valor del examen",
    "precio del examen",
    "valor licencia",
    "precio licencia",
    "cuanto vale renovar",
    "cuánto vale renovar",
    "cuanto cuesta renovar",
    "cuánto cuesta renovar",
  ],

  horarios: [
    "horario",
    "horarios",
    "hora",
    "horas",
    "atienden",
    "atencion",
    "atención",
    "hora atienden",
    "a que hora atienden",
    "a qué hora atienden",
    "a que hora abren",
    "a qué hora abren",
    "a que hora cierran",
    "a qué hora cierran",
    "abren",
    "cierran",
    "hasta que hora",
    "hasta qué hora",
    "desde que hora",
    "desde qué hora",
    "que horario manejan",
    "qué horario manejan",
    "cual es el horario",
    "cuál es el horario",
    "me regalas el horario",
    "me dices el horario",
    "trabajan hoy",
    "trabajan mañana",
    "trabajan los sabados",
    "trabajan los sábados",
    "atienden sabados",
    "atienden sábados",
    "atienden domingos",
    "atienden festivos",
    "abren hoy",
    "abren mañana",
    "esta abierto",
    "está abierto",
    "estan abiertos",
    "están abiertos",
    "horario de atencion",
    "horario de atención",
    "jornada continua",
    "puedo ir hoy",
    "puedo ir mañana",
    "hasta cuando atienden",
    "hasta cuándo atienden",
    "a que horas puedo ir",
    "a qué horas puedo ir",
  ],

  documentos: [
    "documentos",
    "documento",
    "requisitos",
    "requisito",
    "papeles",
    "que debo llevar",
    "qué debo llevar",
    "que tengo que llevar",
    "qué tengo que llevar",
    "que necesito llevar",
    "qué necesito llevar",
    "que necesito",
    "qué necesito",
    "que piden",
    "qué piden",
    "cedula",
    "cédula",
    "cedula fisica",
    "cédula física",
    "cedula original",
    "cédula original",
    "documento fisico",
    "documento físico",
    "documento original",
    "llevar",
    "debo llevar algo",
    "tengo que llevar algo",
    "necesito la cedula",
    "necesito la cédula",
    "puedo llevar copia",
    "sirve copia",
    "sirve fotocopia",
    "fotocopia",
    "documentos para renovar",
    "requisitos para renovar",
    "requisitos licencia",
    "documentos licencia",
    "que papeles llevo",
    "qué papeles llevo",
    "hay que llevar fotos",
    "necesito fotos",
    "llevo pase",
    "llevo licencia",
    "licencia fisica",
    "licencia física",
    "solo cedula",
    "solo cédula",
  ],

  duracion: [
    "duracion",
    "duración",
    "demora",
    "tiempo",
    "tarda",
    "cuanto tarda",
    "cuánto tarda",
    "cuanto demora",
    "cuánto demora",
    "cuanto se demora",
    "cuánto se demora",
    "cuanto tiempo tarda",
    "cuánto tiempo tarda",
    "cuanto tiempo demora",
    "cuánto tiempo demora",
    "cuanto dura",
    "cuánto dura",
    "cuanto dura el proceso",
    "cuánto dura el proceso",
    "cuanto dura el examen",
    "cuánto dura el examen",
    "es rapido",
    "es rápido",
    "se demora mucho",
    "toma mucho tiempo",
    "cuanto me demoro",
    "cuánto me demoro",
    "en cuanto tiempo salgo",
    "en cuánto tiempo salgo",
    "tiempo aproximado",
    "duracion aproximada",
    "duración aproximada",
    "hora de proceso",
    "demora del proceso",
    "demora del examen",
    "cuanto tiempo debo tener",
    "cuánto tiempo debo tener",
    "puedo hacerlo rapido",
    "puedo hacerlo rápido",
    "en una hora",
    "tarda una hora",
  ],

  pagos: [
    "pago",
    "pagos",
    "pagar",
    "medio de pago",
    "medios de pago",
    "formas de pago",
    "forma de pago",
    "como puedo pagar",
    "cómo puedo pagar",
    "donde pago",
    "dónde pago",
    "se puede pagar",
    "puedo pagar",
    "efectivo",
    "tarjeta",
    "tarjeta debito",
    "tarjeta débito",
    "tarjeta credito",
    "tarjeta crédito",
    "datáfono",
    "datafono",
    "nequi",
    "daviplata",
    "bancolombia",
    "davivienda",
    "transferencia",
    "transferir",
    "pse",
    "consignacion",
    "consignación",
    "reciben efectivo",
    "reciben tarjeta",
    "reciben nequi",
    "reciben daviplata",
    "reciben transferencia",
    "puedo pagar con tarjeta",
    "puedo pagar por nequi",
    "puedo pagar por daviplata",
    "puedo transferir",
    "se paga alla",
    "se paga allá",
    "se paga en sede",
    "pago en sede",
    "tienen datafono",
    "tienen datáfono",
    "aceptan tarjeta",
    "aceptan efectivo",
  ],

  vigencia: [
    "vigencia",
    "vigente",
    "certificado",
    "certificacion",
    "certificación",
    "vence",
    "vencimiento",
    "caduca",
    "caducidad",
    "validez",
    "valido",
    "válido",
    "cuanto dura el certificado",
    "cuánto dura el certificado",
    "cuanto dura el examen",
    "cuánto dura el examen",
    "cuanto tiempo dura",
    "cuánto tiempo dura",
    "por cuanto tiempo sirve",
    "por cuánto tiempo sirve",
    "cuanto tiempo es vigente",
    "cuánto tiempo es vigente",
    "cuanto tiempo queda vigente",
    "cuánto tiempo queda vigente",
    "sirve por cuanto tiempo",
    "sirve por cuánto tiempo",
    "vigencia del examen",
    "vigencia del certificado",
    "certificado medico",
    "certificado médico",
    "examen medico vigente",
    "examen médico vigente",
    "si hago el examen cuanto dura",
    "si hago el examen cuánto dura",
    "puedo hacerlo antes",
    "puedo adelantar el examen",
    "lo puedo hacer antes",
    "cuanto tiempo tengo para usarlo",
    "cuánto tiempo tengo para usarlo",
    "me sirve despues",
    "me sirve después",
    "me sirve para despues",
    "me sirve para después",
  ],
};

const FAQ_RESPONSES = {
  direccion: [
    `Claro ✅

📍 *VIP CRC Galerías*
Cra. 28a #51 70, Bogotá.

Ubicación:
https://maps.app.goo.gl/s5RAJ8grQDa7bSoo9

Te esperamos para ayudarte con tu proceso.`,

    `Sí claro ✅

Estamos ubicados en:

📍 *VIP CRC Galerías*
Cra. 28a #51 70, Bogotá.

Te dejo el mapa:
https://maps.app.goo.gl/s5RAJ8grQDa7bSoo9`,

    `Con gusto ✅

Nuestra dirección es:

📍 *Cra. 28a #51 70, Bogotá*
VIP CRC Galerías.

Puedes llegar con este enlace:
https://maps.app.goo.gl/s5RAJ8grQDa7bSoo9`,

    `Claro que sí ✅

📍 *VIP CRC Galerías*
Cra. 28a #51 70, Bogotá.

Al llegar, indica que vienes para el examen médico de licencia.`,

    `Por supuesto ✅

La sede queda en:

📍 *Cra. 28a #51 70, Bogotá*
VIP CRC Galerías.

Ubicación en Google Maps:
https://maps.app.goo.gl/s5RAJ8grQDa7bSoo9`,
  ],

  precios: [
    `Claro ✅

Para renovación / refrendación de licencia, el valor normal es de *$240.000*.

Por esta semana tenemos descuento especial y puedes pagar solo *$180.000* para categoría de carro.`,

    `Sí claro ✅

El trámite de renovación tiene valor normal de *$240.000*, pero actualmente manejamos promoción desde *$180.000* para categoría de carro.`,

    `Con gusto ✅

Para renovar licencia, el valor promocional que estamos manejando es de *$180.000*.

El valor puede variar según el caso o categoría.`,

    `Claro ✅

Tenemos una promoción activa para renovación de licencia:

💰 Valor normal: *$240.000*
🎁 Promoción: *$180.000*

Aplica según categoría y validación del caso.`,

    `Te cuento ✅

El examen/proceso para renovación de licencia puede quedar en promoción desde *$180.000*.

Podemos validar tu caso y orientarte con el valor correcto.`,
  ],

  horarios: [
    `Claro ✅

🕒 *Horario de atención VIP CRC Galerías:*

Lunes a viernes:
*7:00 a.m. a 3:30 p.m.*

Sábados:
*7:00 a.m. a 11:00 a.m.*

Domingos y festivos no laboramos.`,

    `Sí claro ✅

Atendemos en estos horarios:

📅 Lunes a viernes: *7:00 a.m. a 3:30 p.m.*
📅 Sábados: *7:00 a.m. a 11:00 a.m.*

Domingos y festivos no hay atención.`,

    `Con gusto ✅

Nuestro horario es:

🕒 Lunes a viernes de *7:00 a.m. a 3:30 p.m.*
🕒 Sábados de *7:00 a.m. a 11:00 a.m.*

Te recomendamos venir con tiempo.`,

    `Claro ✅

Puedes asistir:

Lunes a viernes: *7:00 a.m. a 3:30 p.m.*
Sábados: *7:00 a.m. a 11:00 a.m.*

No atendemos domingos ni festivos.`,

    `Te confirmo ✅

VIP CRC Galerías atiende de lunes a viernes hasta las *3:30 p.m.* y sábados hasta las *11:00 a.m.*`,
  ],

  documentos: [
    `Claro ✅

Para el examen médico de licencia debes traer:

🪪 *Documento físico original*
📱 Número de contacto
📧 Correo electrónico`,

    `Sí claro ✅

El requisito principal es traer tu *documento físico original*.

También te pediremos teléfono y correo para dejar registrada la atención.`,

    `Con gusto ✅

Debes presentar tu documento de identidad original en físico.

Si estás renovando, también es importante validar tu estado en RUNT.`,

    `Claro ✅

Para avanzar necesitas:

🪪 Cédula física original
📱 Celular de contacto
📧 Correo electrónico

Con eso podemos ayudarte con el proceso.`,

    `Te cuento ✅

Lo más importante es traer tu *documento original físico*. Sin ese documento no se puede completar correctamente la atención.`,
  ],

  duracion: [
    `Claro ✅

El examen médico normalmente puede tardar entre *30 minutos y 1 hora*, dependiendo del flujo de atención en sede.`,

    `Sí claro ✅

El proceso suele tomar aproximadamente entre *30 y 60 minutos*.

Te recomendamos llegar con algo de tiempo.`,

    `Con gusto ✅

La atención puede tardar cerca de *1 hora*, dependiendo de la cantidad de usuarios que haya en el momento.`,

    `Claro ✅

Normalmente es un proceso rápido, pero calcula entre *30 minutos y 1 hora* para hacerlo con tranquilidad.`,

    `Te explico ✅

El tiempo depende del flujo de personas en sede, pero normalmente el examen está entre *30 y 60 minutos*.`,
  ],

  pagos: [
    `Claro ✅

Manejamos diferentes medios de pago según disponibilidad en sede:

💵 Efectivo
💳 Tarjeta / datáfono
📲 Transferencia o medios digitales, si están habilitados.`,

    `Sí claro ✅

Puedes pagar en sede. Normalmente se manejan opciones como efectivo, tarjeta o transferencia según disponibilidad.`,

    `Con gusto ✅

Los medios de pago se confirman directamente en sede, pero normalmente contamos con efectivo y medios electrónicos.`,

    `Claro ✅

Al momento de la atención puedes confirmar el medio de pago disponible con el asesor en sede.`,

    `Te cuento ✅

Puedes consultar el medio de pago al llegar. Generalmente se manejan efectivo y opciones digitales según disponibilidad.`,
  ],

  vigencia: [
    `Claro ✅

El certificado médico del CRC tiene una vigencia de *6 meses*.

Puedes adelantar tu examen y usarlo dentro de ese tiempo para avanzar con la licencia.`,

    `Sí claro ✅

El examen médico queda vigente por *6 meses* desde la fecha de expedición.`,

    `Con gusto ✅

La vigencia del certificado médico es de *6 meses*, por eso puedes adelantar esa parte del trámite.`,

    `Claro ✅

Tu certificado del CRC tiene validez de *6 meses*. Durante ese tiempo puedes usarlo para completar el proceso de licencia.`,

    `Te confirmo ✅

La vigencia es de *6 meses*. Por eso muchas personas hacen primero el examen y luego completan el trámite pendiente.`,
  ],
};

function detectarPreguntaRapida(textoOriginal) {
  const texto = String(textoOriginal || "").toLowerCase();

  for (const [tipo, keywords] of Object.entries(FAQ_KEYWORDS)) {
    if (keywords.some((keyword) => texto.includes(keyword))) {
      return tipo;
    }
  }

  return null;
}

function obtenerRespuestaPreguntaRapida(tipo) {
  const respuestas = FAQ_RESPONSES[tipo];

  if (!respuestas || !respuestas.length) {
    return null;
  }

  const index = Math.floor(Math.random() * respuestas.length);
  return respuestas[index];
}

function esRespuestaSi(textoOriginal) {
  const texto = String(textoOriginal || "").toLowerCase().trim();

  return (
    texto === "1" ||
    texto === "si" ||
    texto === "sí" ||
    texto.includes("seguir") ||
    texto.includes("continuar") ||
    texto.includes("sigamos") ||
    texto.includes("dale") ||
    texto.includes("ok") ||
    texto.includes("listo") ||
    texto.includes("claro")
  );
}

function esRespuestaNo(textoOriginal) {
  const texto = String(textoOriginal || "").toLowerCase().trim();

  return (
    texto === "2" ||
    texto === "no" ||
    texto.includes("despues") ||
    texto.includes("después") ||
    texto.includes("luego") ||
    texto.includes("no por ahora") ||
    texto.includes("cancelar")
  );
}

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

module.exports = {
  getMessage,
  detectarPreguntaRapida,
  obtenerRespuestaPreguntaRapida,
  esRespuestaSi,
  esRespuestaNo,
};

