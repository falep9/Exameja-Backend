const { Router: criarRoute } = require("express");
const { buscarCoordenadas } = require("../controllers/geocodingController");

const rotas = criarRoute();
route.get("/", buscarCoordenadas);
module.exports = route;
