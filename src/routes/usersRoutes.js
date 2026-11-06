const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const { obterMeuPerfil } = require("../controllers/usersController");

const rotas = Router();
rotas.get("/me", autenticarUsuario, obterMeuPerfil);

module.exports = rotas;
