const { Router } = require("express");
const { registrar, criarSessao, obterTokenCsrf, encerrarSessao } = require("../controllers/authController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
rotas.post("/register", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_REGISTRATION_MAX_PER_IP) || 10,
  mensagem: "Limite de cadastros atingido. Tente novamente mais tarde."
}), registrar);
rotas.get("/csrf", obterTokenCsrf);
rotas.post("/session", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_SESSION_MAX_PER_IP) || 20,
  mensagem: "Limite de tentativas de sessão atingido. Tente novamente mais tarde."
}), criarSessao);
rotas.post("/logout", encerrarSessao);

module.exports = rotas;
