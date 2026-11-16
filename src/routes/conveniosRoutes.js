const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirAdministrador = require("../middleware/exigirAdministrador");
const { listar, criar, atualizar } = require("../controllers/conveniosController");

const rotas = Router();
rotas.get("/", listar);
rotas.post("/", autenticarUsuario, exigirAdministrador, criar);
rotas.patch("/:id", autenticarUsuario, exigirAdministrador, atualizar);

module.exports = rotas;
