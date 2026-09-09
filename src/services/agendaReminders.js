"use strict";

// One reminder per renewal flow, only after the scheduling question.
// Timers never send directly: they enter the same per-contact queue as webhooks.
function createAgendaReminders({
  getSession, updateSession, enqueue, sendDates, onError = () => {},
  delayMs = (Number(process.env.CRC_AGENDA_REMINDER_MINUTES) === 2 ? 2 : 3) * 60000,
  setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = (timer) => clearTimeout(timer),
}) {
  const timers = new Map();
  const keyFor = (from) => String(from || "").replace(/\D/g, "");
  function cancel(from) {
    const key = keyFor(from);
    const pending = timers.get(key);
    if (pending) { pending.cancelled = true; clearTimer(pending.timer); timers.delete(key); }
  }
  function eligible(session) {
    return session.step === "AGENDAR_RENOVACION" &&
      !session.botPausadoPorAsesor && !session.noContactar &&
      !session.recordatorioAgendaEnviado && !session.recordatorioAgendaCancelado;
  }
  function schedule(from) {
    cancel(from);
    if (process.env.CRC_AGENDA_REMINDER_ENABLED === "false" || !eligible(getSession(from))) return;
    const key = keyFor(from);
    const pending = { cancelled: false };
    pending.timer = setTimer(() => {
      void enqueue(from, async () => {
        if (pending.cancelled || timers.get(key) !== pending) return;
        timers.delete(key);
        if (!eligible(getSession(from))) return;
        updateSession(from, { recordatorioAgendaEnviado: true });
        try {
          await sendDates(from, "Si te queda más fácil, elige directamente una de estas fechas con horario disponible 👇");
        } catch (error) { onError(from, error); }
      }).catch((error) => onError(from, error));
    }, delayMs);
    pending.timer?.unref?.();
    timers.set(key, pending);
  }
  function close() { for (const key of [...timers.keys()]) cancel(key); }
  return { schedule, cancel, close, pendingCount: () => timers.size };
}
module.exports = { createAgendaReminders };
