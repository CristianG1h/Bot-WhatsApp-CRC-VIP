const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      step: "MENU",
      tramite: null,
      comparendos: null,
      asistencia: null
    });
  }

  return sessions.get(phone);
}

function updateSession(phone, data) {
  const current = getSession(phone);
  sessions.set(phone, { ...current, ...data });
}

function resetSession(phone) {
  sessions.delete(phone);
}

module.exports = {
  getSession,
  updateSession,
  resetSession
};