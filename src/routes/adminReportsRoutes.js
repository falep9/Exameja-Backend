const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const exigirAdministrador = require("../middleware/exigirAdministrador");
const controlador = require("../controllers/adminReportsController");

const rotas = Router();
rotas.use(autenticarUsuario, exigirContaAtiva, exigirAdministrador);
rotas.get("/", controlador.listar);
rotas.put("/:id", controlador.atualizar);

module.exports = rotas;
