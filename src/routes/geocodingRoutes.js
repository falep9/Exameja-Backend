const { Router } = require("express");
const { buscarCoordenadas } = require("../controllers/geocodingController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
rotas.get("/", criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.GEOCODING_MAX_PER_MINUTE) || 10,
  mensagem: "Muitas consultas de endereço em pouco tempo. Tente novamente em instantes."
}), buscarCoordenadas);
module.exports = rotas;
