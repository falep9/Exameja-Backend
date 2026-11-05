const { Router: criarRoute } = require("express");
const { listarEstabelecimentos, detalharEstabelecimento } = require("../controllers/cnesController");

const rotas = criarRoute();
route.get("/estabelecimentos", listarEstabelecimentos);
route.get("/estabelecimentos/:codigoCnes", detalharEstabelecimento);

module.exports = route;
