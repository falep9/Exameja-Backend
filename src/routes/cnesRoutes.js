const { Router } = require("express");
const { listarEstabelecimentos, detalharEstabelecimento } = require("../controllers/cnesController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
const limitarConsultasCnes = criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.CNES_SEARCH_MAX_PER_MINUTE) || 30,
  mensagem: "Muitas consultas ao CNES em pouco tempo. Aguarde um minuto e tente novamente."
});
rotas.get("/estabelecimentos", limitarConsultasCnes, listarEstabelecimentos);
rotas.get("/estabelecimentos/:codigoCnes", limitarConsultasCnes, detalharEstabelecimento);

module.exports = rotas;
