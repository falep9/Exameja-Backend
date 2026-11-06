const { Router } = require("express");
const { buscarCoordenadas } = require("../controllers/geocodingController");

const rotas = Router();
rotas.get("/", buscarCoordenadas);
module.exports = rotas;
