const { Router } = require("express");
const { listarCatalogo, listarProducaoSUS } = require("../controllers/examsController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
const limitarConsultaExterna = criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.EXTERNAL_SEARCH_MAX_PER_MINUTE) || 30,
  mensagem: "Muitas consultas em pouco tempo. Aguarde um minuto e tente novamente."
});
rotas.get("/", limitarConsultaExterna, listarCatalogo);
rotas.get("/sus-production", limitarConsultaExterna, listarProducaoSUS);

module.exports = rotas;
