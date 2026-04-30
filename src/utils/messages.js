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

function getMessage(type) {
  const grupos = {
    precios,
    duracion,
    horarios,
    pagos,
    proceso,
    ubicacion
  };

  return randomItem(grupos[type] || precios);
}

module.exports = {
  getMessage
};