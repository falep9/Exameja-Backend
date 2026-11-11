const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const { iniciar } = require("../controllers/conversationsController");

const rotas = Router();
rotas.post("/", autenticarUsuario, exigirContaAtiva, iniciar);

module.exports = rotas;
