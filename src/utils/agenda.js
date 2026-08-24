"use strict";

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MESES_NUMERO = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const DIAS_NUMERO = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function crearFechaBogota(year, month, day, hour = 12, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

function partesAhoraBogota(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);

  const mapa = {};
  for (const parte of partes) {
    if (parte.type !== "literal") mapa[parte.type] = parte.value;
  }

  let hour = Number(mapa.hour || 0);
  if (hour === 24) hour = 0;

  return {
    year: Number(mapa.year),
    month: Number(mapa.month),
    day: Number(mapa.day),
    hour,
    minute: Number(mapa.minute || 0),
  };
}

function obtenerHoyBogota(offsetDias = 0) {
  const p = partesAhoraBogota();
  const fecha = crearFechaBogota(p.year, p.month, p.day);
  fecha.setUTCDate(fecha.getUTCDate() + offsetDias);
  return fecha;
}

function obtenerAhoraBogota() {
  const p = partesAhoraBogota();
  return crearFechaBogota(p.year, p.month, p.day, p.hour, p.minute);
}

function fechaKey(fecha) {
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const day = String(fecha.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sumarDias(fecha, dias) {
  const nueva = new Date(fecha);
  nueva.setUTCDate(nueva.getUTCDate() + dias);
  return nueva;
}

function siguienteLunes(fecha) {
  const nueva = new Date(fecha);
  const dia = nueva.getUTCDay();
  if (dia === 1) return nueva;
  nueva.setUTCDate(nueva.getUTCDate() + ((8 - dia) % 7));
  return nueva;
}

function fechaPascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return crearFechaBogota(year, month, day);
}

function festivosColombia(year) {
  const pascua = fechaPascua(year);
  const fechas = [];
  const fijo = (month, day) => fechas.push(crearFechaBogota(year, month, day));
  const emiliani = (month, day) =>
    fechas.push(siguienteLunes(crearFechaBogota(year, month, day)));

  fijo(1, 1);
  emiliani(1, 6);
  emiliani(3, 19);
  fechas.push(sumarDias(pascua, -3));
  fechas.push(sumarDias(pascua, -2));
  fechas.push(siguienteLunes(sumarDias(pascua, 39)));
  fechas.push(siguienteLunes(sumarDias(pascua, 60)));
  fechas.push(siguienteLunes(sumarDias(pascua, 68)));
  fijo(5, 1);
  emiliani(6, 29);
  fijo(7, 20);
  fijo(8, 7);
  emiliani(8, 15);
  emiliani(10, 12);
  emiliani(11, 1);
  emiliani(11, 11);
  fijo(12, 8);
  fijo(12, 25);

  return new Set(fechas.map(fechaKey));
}

function esFestivoColombia(fecha) {
  return festivosColombia(fecha.getUTCFullYear()).has(fechaKey(fecha));
}

function esDomingo(fecha) {
  return fecha.getUTCDay() === 0;
}

function esSabado(fecha) {
  return fecha.getUTCDay() === 6;
}

function esDiaLaboralCRC(fecha) {
  return !esDomingo(fecha) && !esFestivoColombia(fecha);
}

function esMismaFecha(a, b) {
  return fechaKey(a) === fechaKey(b);
}

function minutosDelDia(fecha) {
  return fecha.getUTCHours() * 60 + fecha.getUTCMinutes();
}

function horaTexto(minutos) {
  const h24 = Math.floor(minutos / 60);
  const min = minutos % 60;
  const periodo = h24 >= 12 ? "p.m." : "a.m.";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(min).padStart(2, "0")} ${periodo}`;
}

function slotsBasePorFecha(fecha) {
  if (esSabado(fecha)) {
    return [
      { inicio: 7 * 60, fin: 9 * 60 },
      { inicio: 9 * 60, fin: 11 * 60 + 30 },
    ];
  }

  return [
    { inicio: 7 * 60, fin: 9 * 60 },
    { inicio: 9 * 60, fin: 11 * 60 },
    { inicio: 11 * 60, fin: 13 * 60 },
    { inicio: 13 * 60, fin: 15 * 60 + 30 },
  ];
}

function obtenerSlotsDisponibles(fecha) {
  if (!esDiaLaboralCRC(fecha)) return [];

  const ahora = obtenerAhoraBogota();
  const hoy = obtenerHoyBogota();
  const esHoy = esMismaFecha(fecha, hoy);
  const ahoraMin = minutosDelDia(ahora);
  const margenMin = 15;

  return slotsBasePorFecha(fecha)
    .filter((slot) => !esHoy || slot.fin > ahoraMin + margenMin)
    .map((slot) => ({
      ...slot,
      texto: `${esHoy && ahoraMin > slot.inicio ? "Ahora" : horaTexto(slot.inicio)} a ${horaTexto(slot.fin)}`,
    }));
}

function tieneDisponibilidad(fecha) {
  return esDiaLaboralCRC(fecha) && obtenerSlotsDisponibles(fecha).length > 0;
}

function obtenerProximosDiasDisponibles(cantidad = 2, desde = obtenerHoyBogota()) {
  const dias = [];
  let fecha = new Date(desde);

  for (let i = 0; i < 45 && dias.length < cantidad; i += 1) {
    if (tieneDisponibilidad(fecha)) dias.push(new Date(fecha));
    fecha = sumarDias(fecha, 1);
  }

  return dias;
}

function obtenerSiguienteDiaDisponible(desde) {
  return obtenerProximosDiasDisponibles(1, desde)[0] || null;
}

function formatearFechaColombia(fecha, capitalizar = false) {
  const texto = `${DIAS_SEMANA[fecha.getUTCDay()]}, ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;
  return capitalizar ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

function etiquetaFechaOpcion(fecha) {
  const hoy = obtenerHoyBogota();
  const diferencia = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
  const fechaTexto = formatearFechaColombia(fecha, true);

  if (diferencia === 0) return `Hoy — ${fechaTexto}`;
  if (diferencia === 1) return `Mañana — ${fechaTexto}`;
  return fechaTexto;
}

function horarioGeneralFecha(fecha) {
  return esSabado(fecha) ? "7:00 a.m. a 11:30 a.m." : "7:00 a.m. a 3:30 p.m.";
}

function menuDiasDisponibles() {
  const dias = obtenerProximosDiasDisponibles(2);
  const opciones = dias
    .map(
      (fecha, index) =>
        `${index + 1}️⃣ *${etiquetaFechaOpcion(fecha)}*\n   Horario: ${horarioGeneralFecha(fecha)}`
    )
    .join("\n\n");

  return `Perfecto ✅\n\nVamos a continuar directamente con tu agendamiento.\n\nElige uno de los próximos días disponibles:\n\n${opciones}\n\n3️⃣ *Otro día*\n\nDomingos y festivos no laboramos.\n\nResponde con el número de la opción.`;
}

function detectarOpcionDia(msg) {
  const texto = normalizarTexto(msg);
  const dias = obtenerProximosDiasDisponibles(2);

  if (texto === "1" && dias[0]) {
    return { tipo: "fecha", fecha: dias[0], texto: formatearFechaColombia(dias[0]) };
  }

  if (texto === "2" && dias[1]) {
    return { tipo: "fecha", fecha: dias[1], texto: formatearFechaColombia(dias[1]) };
  }

  if (texto === "3" || texto.includes("otro dia") || texto === "otro" || texto === "otra") {
    return { tipo: "otro", fecha: null, texto: "Otro día" };
  }

  if (texto.includes("hoy")) {
    const hoy = obtenerHoyBogota();
    if (tieneDisponibilidad(hoy)) {
      return { tipo: "fecha", fecha: hoy, texto: formatearFechaColombia(hoy) };
    }
  }

  if (texto.includes("manana")) {
    const manana = obtenerHoyBogota(1);
    if (tieneDisponibilidad(manana)) {
      return { tipo: "fecha", fecha: manana, texto: formatearFechaColombia(manana) };
    }
  }

  return null;
}

function menuHorariosCita(fecha) {
  const slots = obtenerSlotsDisponibles(fecha);
  if (!slots.length) return null;

  const opciones = slots
    .map((slot, index) => `${index + 1}️⃣ ${slot.texto}`)
    .join("\n");

  return `Perfecto ✅\n\nDía seleccionado:\n📅 *${formatearFechaColombia(fecha)}*\n\nElige un horario aproximado de llegada:\n\n${opciones}\n${slots.length + 1}️⃣ Otro horario\n\nResponde con el número de la opción.`;
}

function construirFechaValida(year, month, day) {
  const fecha = crearFechaBogota(year, month, day);
  if (
    fecha.getUTCFullYear() !== year ||
    fecha.getUTCMonth() + 1 !== month ||
    fecha.getUTCDate() !== day
  ) {
    return null;
  }
  return fecha;
}

function ajustarYearSiFalta(day, month, year) {
  if (year) return year;
  const hoy = obtenerHoyBogota();
  const candidato = construirFechaValida(hoy.getUTCFullYear(), month, day);
  if (!candidato) return null;
  if (candidato.getTime() < hoy.getTime()) return hoy.getUTCFullYear() + 1;
  return hoy.getUTCFullYear();
}

function parsearFechaUsuario(valor) {
  const texto = normalizarTexto(valor)
    .replace(/\bdel\b/g, "de")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!texto) return null;
  if (texto === "hoy") return obtenerHoyBogota();
  if (texto === "manana") return obtenerHoyBogota(1);

  const numerica = texto.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numerica) {
    const day = Number(numerica[1]);
    const month = Number(numerica[2]);
    let year = numerica[3] ? Number(numerica[3]) : null;
    if (year && year < 100) year += 2000;
    year = ajustarYearSiFalta(day, month, year);
    return year ? construirFechaValida(year, month, day) : null;
  }

  const nombresMes = Object.keys(MESES_NUMERO).join("|");
  const escrita = texto.match(
    new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s*)?(${nombresMes})(?:\\s*(?:de\\s*)?(\\d{4}))?\\b`)
  );

  if (escrita) {
    const day = Number(escrita[1]);
    const month = MESES_NUMERO[escrita[2]];
    const year = ajustarYearSiFalta(day, month, escrita[3] ? Number(escrita[3]) : null);
    return year ? construirFechaValida(year, month, day) : null;
  }

  const soloDiaSemana = Object.keys(DIAS_NUMERO).find(
    (nombre) => texto === nombre || texto.startsWith(`${nombre} `)
  );

  if (soloDiaSemana) {
    const objetivo = DIAS_NUMERO[soloDiaSemana];
    const hoy = obtenerHoyBogota();

    for (let offset = 0; offset <= 7; offset += 1) {
      const candidato = sumarDias(hoy, offset);
      if (candidato.getUTCDay() !== objetivo) continue;
      if (offset === 0 && !tieneDisponibilidad(candidato)) continue;
      return candidato;
    }
  }

  return null;
}

function esFechaPasada(fecha) {
  return fecha.getTime() < obtenerHoyBogota().getTime();
}

function motivoNoLaboral(fecha) {
  if (esDomingo(fecha)) return "domingo";
  if (esFestivoColombia(fecha)) return "festivo";
  return null;
}

module.exports = {
  detectarOpcionDia,
  esFechaPasada,
  fechaKey,
  formatearFechaColombia,
  menuDiasDisponibles,
  menuHorariosCita,
  motivoNoLaboral,
  obtenerSiguienteDiaDisponible,
  obtenerSlotsDisponibles,
  parsearFechaUsuario,
  sumarDias,
};
