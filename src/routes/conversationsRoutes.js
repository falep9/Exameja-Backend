const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const {
  iniciar,
  enviar,
  listar,
  listarMensagens
} = require("../controllers/conversationsController");

const rotas = Router();
rotas.post("/", autenticarUsuario, exigirContaAtiva, iniciar);
rotas.post("/:id/messages", autenticarUsuario, exigirContaAtiva, enviar);
rotas.get("/", autenticarUsuario, exigirContaAtiva, listar);
rotas.get("/:id/messages", autenticarUsuario, exigirContaAtiva, listarMensagens);

module.exports = rotas;
