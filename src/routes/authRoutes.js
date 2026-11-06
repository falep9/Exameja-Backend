const { Router } = require("express");
const { registrar } = require("../controllers/authController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
rotas.post("/register", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_REGISTRATION_MAX_PER_IP) || 10,
  mensagem: "Limite de cadastros atingido. Tente novamente mais tarde."
}), registrar);

module.exports = rotas;
