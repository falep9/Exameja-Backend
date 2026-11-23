const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const controlador = require("../controllers/reportsController");

const rotas = Router();
rotas.post("/", autenticarUsuario, exigirContaAtiva, controlador.criar);

module.exports = rotas;
