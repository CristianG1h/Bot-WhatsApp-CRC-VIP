const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      step: "MENU_INICIAL",
      linea: null,
      tramite: null,
      comparendos: null,
      asistencia: null,
      cedula: null,
      documentoSimit: null,
      simitTienePendientes: false,
      horarioCita: null,
      nombreCita: null,
      cedulaCita: null,
      telefonoCita: null,
      correoCita: null,
    });
  }

  return sessions.get(phone);
}

function updateSession(phone, data) {
  const current = getSession(phone);

  const nuevaSession = {
    ...current,
    ...data,
  };

  sessions.set(phone, nuevaSession);

  console.log("✅ Sesión actualizada:", phone, nuevaSession);
}

function resetSession(phone) {
  sessions.delete(phone);
  console.log("🧹 Sesión reiniciada:", phone);
}

module.exports = {
  getSession,
  updateSession,
  resetSession,
};
