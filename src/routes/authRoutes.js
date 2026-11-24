const { Router } = require("express");
const { registrar, login, obterMinhaSessao, criarSessao, obterTokenCsrf, encerrarSessao, recuperarSenha, reenviarVerificacao } = require("../controllers/authController");
const criarLimitador = require("../middleware/limitarRequisicoes");
const autenticarUsuario = require("../middleware/autenticarUsuario");

const rotas = Router();
rotas.post("/register", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_REGISTRATION_MAX_PER_IP) || 10,
  mensagem: "Limite de cadastros atingido. Tente novamente mais tarde."
}), registrar);
rotas.post("/login", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_LOGIN_MAX_PER_IP) || 20,
  mensagem: "Limite de tentativas de login atingido. Tente novamente mais tarde."
}), login);
rotas.get("/me", autenticarUsuario, obterMinhaSessao);
rotas.get("/csrf", obterTokenCsrf);
rotas.post("/password-reset", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_PASSWORD_RESET_MAX_PER_IP) || 5,
  mensagem: "Limite de solicitações atingido. Tente novamente mais tarde."
}), recuperarSenha);
rotas.post("/email-verification", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_EMAIL_VERIFICATION_MAX_PER_IP) || 5,
  mensagem: "Limite de solicitações atingido. Tente novamente mais tarde."
}), reenviarVerificacao);
rotas.post("/session", criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maximo: Number(process.env.AUTH_SESSION_MAX_PER_IP) || 20,
  mensagem: "Limite de tentativas de sessão atingido. Tente novamente mais tarde."
}), criarSessao);
rotas.post("/logout", encerrarSessao);

module.exports = rotas;
