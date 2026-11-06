const { Router } = require("express");
const { listarCatalogo, listarProducaoSUS, buscar } = require("../controllers/examsController");

const rotas = Router();
rotas.get("/search", buscar);
rotas.get("/", listarCatalogo);
rotas.get("/sus-production", listarProducaoSUS);

module.exports = rotas;
