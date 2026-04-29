function limpiarTexto(text) {
  return String(text || "").trim();
}

function esCedulaValida(text) {
  return /^[0-9]{5,12}$/.test(String(text || "").trim());
}

module.exports = {
  limpiarTexto,
  esCedulaValida
};