const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const exigirClinicaAprovada = require("../middleware/exigirClinicaAprovada");
const {
  iniciar,
  enviar,
  listar,
  listarMensagens
} = require("../controllers/conversationsController");

const rotas = Router();
rotas.post("/", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, iniciar);
rotas.post("/:id/messages", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, enviar);
rotas.get("/", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, listar);
rotas.get("/:id/messages", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, listarMensagens);

module.exports = rotas;
