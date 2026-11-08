const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const { sugerirPorConvenio } = require("../controllers/clinicsController");

const rotas = Router();
rotas.get("/suggestions", autenticarUsuario, sugerirPorConvenio);

module.exports = rotas;
