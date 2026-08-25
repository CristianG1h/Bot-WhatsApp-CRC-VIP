"use strict";

const express = require("express");
const router = express.Router();

// Compatibilidad temporal: la foto de la sede ahora se envía dentro del
// mensaje interactivo de promoción desde services/whatsapp.js.
router.use((_req, _res, next) => next());

module.exports = router;
