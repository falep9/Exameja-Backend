const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const controlador = require("../controllers/reviewsController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
rotas.post("/", criarLimitador({ janelaMs: 60 * 60 * 1000, maximo: 20, mensagem: "Muitas avaliações em pouco tempo." }), autenticarUsuario, exigirContaAtiva, controlador.criar);
module.exports = rotas;
