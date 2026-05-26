"use strict";

let Pool = null;

try {
  Pool = require("pg").Pool;
} catch {
  console.warn("⚠️ Paquete pg no instalado. Stats funcionará solo en memoria.");
}

const DATABASE_URL = process.env.DATABASE_URL;

const DEFAULT_STATS = {
  contactosUnicos: [],
  mensajesRecibidos: 0,
  mensajesEnviados: 0,
  runtConsultas: 0,
  simitConsultas: 0,
  citasPreconfirmadas: 0,
  asesoresActivados: 0,
  mensajesNoReconocidos: 0,
  duplicadosIgnorados: 0,
  rateLimitados: 0,
  erroresBot: 0,
  ultimasInteracciones: [],
  keywords: {
    menu: 0,
    hola: 0,
    crc: 0,
    cia: 0,
    runt: 0,
    simit: 0,
    cita: 0,
    asesor: 0,
    no_reconocido: 0,
    error: 0,
  },
  porHora: Array(24).fill(0),
  porDia: {},
  iniciadoEn: new Date().toISOString(),
};

function cloneBase() {
  return JSON.parse(JSON.stringify(DEFAULT_STATS));
}

let stats = cloneBase();
const usePostgres = Boolean(Pool && DATABASE_URL);
const pool = usePostgres
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : null;

function fechaBogotaKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function horaBogota(date = new Date()) {
  return date.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fechaBogotaLabel(date = new Date()) {
  return date.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
  });
}

function normalizarWaId(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function maskPhone(value = "") {
  const s = normalizarWaId(value);
  if (!s) return "sin número";
  return `${s.slice(0, 6)}***${s.slice(-2)}`;
}

function safeKeywords(arr = []) {
  return Array.from(new Set(arr.filter(Boolean).map((x) => String(x).trim().toLowerCase()).filter(Boolean)));
}

function registrarContactoUnico(waId) {
  const limpio = normalizarWaId(waId);
  if (!limpio) return;
  if (!Array.isArray(stats.contactosUnicos)) stats.contactosUnicos = [];
  if (!stats.contactosUnicos.includes(limpio)) stats.contactosUnicos.push(limpio);
}

function sumarDiaYHora(ahora = new Date()) {
  const horaTexto = ahora.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    hour12: false,
  });
  const hora = Number(String(horaTexto).replace(/\D/g, ""));
  if (!Number.isNaN(hora) && hora >= 0 && hora <= 23) stats.porHora[hora] = (stats.porHora[hora] || 0) + 1;

  const key = fechaBogotaKey(ahora);
  stats.porDia[key] = (stats.porDia[key] || 0) + 1;
}

function sumarKeyword(key) {
  if (!key) return;
  stats.keywords[key] = (stats.keywords[key] || 0) + 1;
}

async function initDb() {
  if (!pool) {
    console.log("⚠️ Stats sin PostgreSQL. Funcionará solo en memoria.");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_stats (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_events (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        wa_id TEXT,
        wa_mask TEXT,
        tipo TEXT NOT NULL,
        detalle TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'ok',
        keywords TEXT[] DEFAULT '{}'
      );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_events_ts ON bot_events (ts DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_events_wa_id ON bot_events (wa_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_events_tipo ON bot_events (tipo);`);

    const result = await pool.query("SELECT data FROM bot_stats WHERE id = $1 LIMIT 1", ["dashboard_crc"]);
    if (result.rows.length > 0 && result.rows[0].data) {
      const saved = result.rows[0].data;
      const base = cloneBase();
      stats = {
        ...base,
        ...saved,
        contactosUnicos: Array.isArray(saved.contactosUnicos) ? saved.contactosUnicos : [],
        keywords: { ...base.keywords, ...(saved.keywords || {}) },
        porHora: Array.isArray(saved.porHora) && saved.porHora.length === 24 ? saved.porHora : Array(24).fill(0),
        porDia: saved.porDia || {},
        ultimasInteracciones: Array.isArray(saved.ultimasInteracciones) ? saved.ultimasInteracciones : [],
        iniciadoEn: saved.iniciadoEn || new Date().toISOString(),
      };
      console.log("✅ Estadísticas CRC cargadas desde PostgreSQL");
    } else {
      await saveStatsNow();
      console.log("✅ Estadísticas CRC iniciales creadas en PostgreSQL");
    }
  } catch (error) {
    console.error("❌ Error inicializando estadísticas CRC:", error.message);
  }
}

let saveTimer = null;
function saveStatsSoon() {
  if (!pool) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStatsNow().catch((error) => console.error("❌ Error guardando estadísticas CRC:", error.message));
  }, 500);
}

async function saveStatsNow() {
  if (!pool) return;
  await pool.query(
    `
    INSERT INTO bot_stats (id, data, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    ["dashboard_crc", stats]
  );
}

function registrarEventoDb({ waId, tipo, detalle, estado, keywords }) {
  if (!pool) return;
  const ahora = new Date();
  const waClean = normalizarWaId(waId);

  pool
    .query(
      `
      INSERT INTO bot_events (ts, fecha, hora, wa_id, wa_mask, tipo, detalle, estado, keywords)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        fechaBogotaKey(ahora),
        horaBogota(ahora),
        waClean || null,
        waClean ? maskPhone(waClean) : null,
        String(tipo || "evento"),
        String(detalle || "").slice(0, 250),
        String(estado || "ok"),
        safeKeywords(keywords),
      ]
    )
    .catch((error) => console.error("❌ Error guardando evento CRC:", error.message));
}

function registrarInteraccion({ waId = "", tipo = "evento", detalle = "", estado = "ok", keywords = [] }) {
  const ahora = new Date();
  stats.ultimasInteracciones.unshift({
    fecha: fechaBogotaKey(ahora),
    hora: horaBogota(ahora),
    tipo,
    detalle: String(detalle || "").slice(0, 160),
    estado,
    ts: ahora.getTime(),
  });
  stats.ultimasInteracciones = stats.ultimasInteracciones.slice(0, 50);
  sumarDiaYHora(ahora);
  for (const key of safeKeywords(keywords)) sumarKeyword(key);
  registrarEventoDb({ waId, tipo, detalle, estado, keywords });
  saveStatsSoon();
}

function buildDateFilter(query = {}) {
  const range = String(query.range || "all");
  const from = String(query.from || "");
  const to = String(query.to || "");
  const now = new Date();
  let start = null;
  let end = null;

  if (range === "today") {
    const key = fechaBogotaKey(now);
    start = `${key}T00:00:00-05:00`;
    end = `${key}T23:59:59-05:00`;
  }
  if (range === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    start = `${fechaBogotaKey(d)}T00:00:00-05:00`;
    end = `${fechaBogotaKey(now)}T23:59:59-05:00`;
  }
  if (range === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    start = `${fechaBogotaKey(d)}T00:00:00-05:00`;
    end = `${fechaBogotaKey(now)}T23:59:59-05:00`;
  }
  if (range === "custom" && from && to) {
    start = `${from}T00:00:00-05:00`;
    end = `${to}T23:59:59-05:00`;
  }
  return { start, end, range };
}

function buildChartDateFilter(query = {}) {
  const range = String(query.chartRange || "14d");
  const offset = Number(query.chartOffset || 0);
  let days = 14;
  if (range === "today") days = 1;
  if (range === "7d") days = 7;
  if (range === "30d") days = 30;

  if (range === "custom" && query.chartFrom && query.chartTo) {
    return {
      start: `${query.chartFrom}T00:00:00-05:00`,
      end: `${query.chartTo}T23:59:59-05:00`,
      range,
      days: null,
      desde: query.chartFrom,
      hasta: query.chartTo,
    };
  }

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + offset * days);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));
  const desde = fechaBogotaKey(startDate);
  const hasta = fechaBogotaKey(endDate);
  return { start: `${desde}T00:00:00-05:00`, end: `${hasta}T23:59:59-05:00`, range, days, desde, hasta };
}

function buildWhere(query = {}, chart = false) {
  const params = [];
  const where = [];
  const filter = chart ? buildChartDateFilter(query) : buildDateFilter(query);

  if (filter.start && filter.end) {
    params.push(filter.start);
    where.push(`ts >= $${params.length}`);
    params.push(filter.end);
    where.push(`ts <= $${params.length}`);
  }

  const q = String(query.q || "").trim();
  if (q) {
    const qClean = q.replace(/\D/g, "");
    params.push(`%${q.toLowerCase()}%`);
    const pText = `$${params.length}`;
    if (qClean.length >= 4) {
      params.push(`%${qClean}%`);
      const pPhone = `$${params.length}`;
      where.push(`(LOWER(detalle) LIKE ${pText} OR LOWER(tipo) LIKE ${pText} OR LOWER(estado) LIKE ${pText} OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE LOWER(k) LIKE ${pText}) OR wa_id LIKE ${pPhone})`);
    } else {
      where.push(`(LOWER(detalle) LIKE ${pText} OR LOWER(tipo) LIKE ${pText} OR LOWER(estado) LIKE ${pText} OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE LOWER(k) LIKE ${pText}))`);
    }
  }

  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params, filter };
}

function emptyKeywords() {
  return { ...cloneBase().keywords };
}

function buildMemoryChart(query = {}) {
  const meta = buildChartDateFilter(query);
  const out = [];
  const startDate = new Date(`${meta.desde}T00:00:00-05:00`);
  const endDate = new Date(`${meta.hasta}T00:00:00-05:00`);
  for (let d = new Date(startDate); d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
    const key = fechaBogotaKey(d);
    out.push({ fecha: key, label: fechaBogotaLabel(d), total: stats.porDia[key] || 0 });
  }
  return { actividadPorDia: out, chartMeta: meta };
}

async function getSnapshotPostgres(query = {}) {
  const where = buildWhere(query, false);
  const totalsResult = await pool.query(
    `
    SELECT
      COUNT(DISTINCT wa_id) FILTER (WHERE wa_id IS NOT NULL AND tipo = 'mensaje_recibido')::int AS conversaciones,
      COUNT(*) FILTER (WHERE tipo = 'mensaje_recibido')::int AS mensajes_recibidos,
      COUNT(*) FILTER (WHERE tipo IN ('mensaje_enviado','menu','crc','cia','faq','asesor','runt','simit','cita'))::int AS mensajes_enviados,
      COUNT(*) FILTER (WHERE tipo = 'runt')::int AS runt_consultas,
      COUNT(*) FILTER (WHERE tipo = 'simit')::int AS simit_consultas,
      COUNT(*) FILTER (WHERE tipo = 'cita')::int AS citas_preconfirmadas,
      COUNT(*) FILTER (WHERE tipo = 'asesor')::int AS asesores_activados,
      COUNT(*) FILTER (WHERE tipo = 'no_reconocido')::int AS mensajes_no_reconocidos,
      COUNT(*) FILTER (WHERE tipo = 'duplicado')::int AS duplicados_ignorados,
      COUNT(*) FILTER (WHERE tipo = 'rate_limit')::int AS rate_limitados,
      COUNT(*) FILTER (WHERE tipo = 'error')::int AS errores_bot
    FROM bot_events
    ${where.sql}
    `,
    where.params
  );

  const logsResult = await pool.query(
    `SELECT fecha, hora, tipo, detalle, estado, wa_mask, ts FROM bot_events ${where.sql} ORDER BY ts DESC LIMIT 50`,
    where.params
  );

  const chartWhere = buildWhere(query, true);
  const chartMeta = chartWhere.filter;
  const daysResult = await pool.query(
    `SELECT fecha, COUNT(*)::int AS total FROM bot_events ${chartWhere.sql} GROUP BY fecha ORDER BY fecha ASC`,
    chartWhere.params
  );
  const daysMap = {};
  for (const row of daysResult.rows) daysMap[row.fecha] = Number(row.total || 0);

  const actividadPorDia = [];
  const startDate = new Date(`${chartMeta.desde}T00:00:00-05:00`);
  const endDate = new Date(`${chartMeta.hasta}T00:00:00-05:00`);
  for (let d = new Date(startDate); d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
    const key = fechaBogotaKey(d);
    actividadPorDia.push({ fecha: key, label: fechaBogotaLabel(d), total: daysMap[key] || 0 });
  }

  const keywordResult = await pool.query(
    `SELECT LOWER(k) AS keyword, COUNT(*)::int AS total FROM bot_events, unnest(keywords) AS k ${where.sql} GROUP BY LOWER(k) ORDER BY total DESC LIMIT 20`,
    where.params
  );
  const keywords = emptyKeywords();
  for (const row of keywordResult.rows) keywords[row.keyword] = Number(row.total || 0);

  const t = totalsResult.rows[0] || {};
  return {
    totales: {
      conversaciones: Number(t.conversaciones || 0),
      mensajesRecibidos: Number(t.mensajes_recibidos || 0),
      mensajesEnviados: Number(t.mensajes_enviados || 0),
      runtConsultas: Number(t.runt_consultas || 0),
      simitConsultas: Number(t.simit_consultas || 0),
      citasPreconfirmadas: Number(t.citas_preconfirmadas || 0),
      asesoresActivados: Number(t.asesores_activados || 0),
      mensajesNoReconocidos: Number(t.mensajes_no_reconocidos || 0),
      duplicadosIgnorados: Number(t.duplicados_ignorados || 0),
      rateLimitados: Number(t.rate_limitados || 0),
      erroresBot: Number(t.errores_bot || 0),
    },
    ultimasInteracciones: logsResult.rows.map((r) => ({ fecha: r.fecha, hora: r.hora, tipo: r.tipo, detalle: r.detalle, estado: r.estado, wa_mask: r.wa_mask, ts: r.ts })),
    keywords,
    actividadPorDia,
    actividadPorHora: stats.porHora,
    iniciadoEn: stats.iniciadoEn,
    uptime: Math.floor(process.uptime()),
    persistencia: "postgresql",
    zonaHoraria: "America/Bogota",
    chartMeta: { range: chartMeta.range, desde: chartMeta.desde, hasta: chartMeta.hasta },
    filtros: { q: query.q || "", range: query.range || "all", from: query.from || "", to: query.to || "", chartRange: query.chartRange || "14d", chartOffset: query.chartOffset || "0" },
  };
}

function getSnapshotMemoria(query = {}) {
  const chart = buildMemoryChart(query);
  return {
    totales: {
      conversaciones: Array.isArray(stats.contactosUnicos) ? stats.contactosUnicos.length : 0,
      mensajesRecibidos: stats.mensajesRecibidos,
      mensajesEnviados: stats.mensajesEnviados,
      runtConsultas: stats.runtConsultas,
      simitConsultas: stats.simitConsultas,
      citasPreconfirmadas: stats.citasPreconfirmadas,
      asesoresActivados: stats.asesoresActivados,
      mensajesNoReconocidos: stats.mensajesNoReconocidos,
      duplicadosIgnorados: stats.duplicadosIgnorados,
      rateLimitados: stats.rateLimitados,
      erroresBot: stats.erroresBot,
    },
    ultimasInteracciones: stats.ultimasInteracciones.slice(0, 50),
    keywords: stats.keywords,
    actividadPorDia: chart.actividadPorDia,
    actividadPorHora: stats.porHora,
    iniciadoEn: stats.iniciadoEn,
    uptime: Math.floor(process.uptime()),
    persistencia: "memoria",
    zonaHoraria: "America/Bogota",
    chartMeta: { range: chart.chartMeta.range, desde: chart.chartMeta.desde, hasta: chart.chartMeta.hasta },
    filtros: { q: query.q || "", range: query.range || "all", from: query.from || "", to: query.to || "", chartRange: query.chartRange || "14d", chartOffset: query.chartOffset || "0" },
  };
}

const Stats = {
  mensajeRecibido(waId) {
    registrarContactoUnico(waId);
    stats.mensajesRecibidos++;
    registrarInteraccion({ waId, tipo: "mensaje_recibido", detalle: `Nuevo mensaje de ${maskPhone(waId)}`, estado: "ok", keywords: [] });
  },
  mensajeEnviado(waId = "", detalle = "Mensaje enviado por el bot", tipo = "mensaje_enviado") {
    stats.mensajesEnviados++;
    registrarInteraccion({ waId, tipo, detalle, estado: "ok", keywords: [tipo] });
  },
  menuEnviado(waId) {
    stats.mensajesEnviados++;
    registrarInteraccion({ waId, tipo: "menu", detalle: `Menú enviado a ${maskPhone(waId)}`, estado: "ok", keywords: ["menu", "hola"] });
  },
  runtConsultado(waId, cedula = "", estado = "ok") {
    if (estado === "ok") stats.runtConsultas++;
    registrarInteraccion({ waId, tipo: "runt", detalle: `Consulta RUNT ${estado} ${cedula ? `- ${cedula}` : ""}`.trim(), estado, keywords: ["runt", "crc"] });
  },
  simitConsultado(waId, documento = "", estado = "ok") {
    if (estado === "ok") stats.simitConsultas++;
    registrarInteraccion({ waId, tipo: "simit", detalle: `Consulta SIMIT ${estado} ${documento ? `- ${documento}` : ""}`.trim(), estado, keywords: ["simit", "cia"] });
  },
  citaPreconfirmada(waId, nombre = "usuario") {
    stats.citasPreconfirmadas++;
    registrarInteraccion({ waId, tipo: "cita", detalle: `Cita preconfirmada: ${nombre}`, estado: "ok", keywords: ["cita", "crc"] });
  },
  asesorActivado(waId, motivo = "Asesor activado") {
    stats.asesoresActivados++;
    registrarInteraccion({ waId, tipo: "asesor", detalle: `${motivo} para ${maskPhone(waId)}`, estado: "asesor", keywords: ["asesor"] });
  },
  mensajeNoReconocido(waId, texto = "") {
    stats.mensajesNoReconocidos++;
    registrarInteraccion({ waId, tipo: "no_reconocido", detalle: `No reconocido de ${maskPhone(waId)}: "${String(texto).slice(0, 50)}"`, estado: "warn", keywords: ["no_reconocido"] });
  },
  duplicadoIgnorado(waId, id = "") {
    stats.duplicadosIgnorados++;
    registrarInteraccion({ waId, tipo: "duplicado", detalle: `Duplicado ignorado ${id}`.trim(), estado: "warn", keywords: ["duplicado"] });
  },
  rateLimitado(waId) {
    stats.rateLimitados++;
    registrarInteraccion({ waId, tipo: "rate_limit", detalle: `Rate limit para ${maskPhone(waId)}`, estado: "warn", keywords: ["rate_limit"] });
  },
  error(waId = "", detalle = "Error del bot") {
    stats.erroresBot++;
    registrarInteraccion({ waId, tipo: "error", detalle, estado: "error", keywords: ["error"] });
  },
  resetStats() {
    stats = cloneBase();
    saveStatsSoon();
  },
  async getSnapshot(query = {}) {
    if (pool) return await getSnapshotPostgres(query);
    return getSnapshotMemoria(query);
  },
};

initDb();

module.exports = Stats;
