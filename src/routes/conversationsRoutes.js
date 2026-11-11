const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const { iniciar, enviar } = require("../controllers/conversationsController");

const rotas = Router();
rotas.post("/", autenticarUsuario, exigirContaAtiva, iniciar);
rotas.post("/:id/messages", autenticarUsuario, exigirContaAtiva, enviar);

module.exports = rotas;
