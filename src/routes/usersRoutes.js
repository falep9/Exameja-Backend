const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const { obterMeuPerfil, atualizarMeuPerfil } = require("../controllers/usersController");

const rotas = Router();
rotas.get("/me", autenticarUsuario, obterMeuPerfil);
rotas.patch("/me", autenticarUsuario, atualizarMeuPerfil);

module.exports = rotas;
