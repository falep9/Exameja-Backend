const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const { avaliar, listar } = require("../controllers/reviewsController");

const rotas = Router();
rotas.post("/", autenticarUsuario, exigirContaAtiva, avaliar);
rotas.get("/", autenticarUsuario, exigirContaAtiva, listar);

module.exports = rotas;
