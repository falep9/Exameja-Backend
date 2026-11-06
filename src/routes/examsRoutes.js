const { Router } = require("express");
const { listarCatalogo, listarProducaoSUS } = require("../controllers/examsController");

const rotas = Router();
rotas.get("/", listarCatalogo);
rotas.get("/sus-production", listarProducaoSUS);

module.exports = rotas;
