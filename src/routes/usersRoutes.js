const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const { obterMeuPerfil, atualizarMeuPerfil } = require("../controllers/usersController");
const controladorNotificacoes = require("../controllers/notificationsController");

const rotas = Router();
rotas.get("/me", autenticarUsuario, obterMeuPerfil);
rotas.patch("/me", autenticarUsuario, exigirContaAtiva, atualizarMeuPerfil);
rotas.get("/notifications", autenticarUsuario, controladorNotificacoes.listar);
rotas.patch("/notifications/:id/read", autenticarUsuario, controladorNotificacoes.marcarComoLida);

module.exports = rotas;
