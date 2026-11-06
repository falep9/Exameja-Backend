const { Router } = require("express");
const { listarEstabelecimentos, detalharEstabelecimento } = require("../controllers/cnesController");

const rotas = Router();
rotas.get("/estabelecimentos", listarEstabelecimentos);
rotas.get("/estabelecimentos/:codigoCnes", detalharEstabelecimento);

module.exports = rotas;
