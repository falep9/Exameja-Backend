const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const exigirClinicaAprovada = require("../middleware/exigirClinicaAprovada");
const { sugerirPorConvenio, reenviarParaAnalise } = require("../controllers/clinicsController");
const controladorBusca = require("../controllers/clinicSearchController");
const controladorDetalhes = require("../controllers/clinicDetailsController");
const controladorMapa = require("../controllers/clinicMapController");
const controladorOfertas = require("../controllers/clinicOffersController");
const criarLimitador = require("../middleware/limitarRequisicoes");
const disponibilidade = require("../controllers/availabilityController");
const avaliacoes = require("../controllers/reviewsController");

const rotas = Router();
rotas.get("/search", criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.CLINIC_SEARCH_MAX_PER_MINUTE) || 30,
  mensagem: "Muitas buscas em pouco tempo. Aguarde um minuto e tente novamente."
}), controladorBusca.buscar);
rotas.get("/map", criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.CLINIC_SEARCH_MAX_PER_MINUTE) || 30,
  mensagem: "Muitas consultas ao mapa em pouco tempo. Aguarde um minuto e tente novamente."
}), controladorMapa.listar);
rotas.get("/suggestions", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, sugerirPorConvenio);
rotas.get("/me/exams", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.listar);
rotas.get("/me/exams/:codigoExame/history", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.listarHistorico);
rotas.put("/me/exams/:codigoExame", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.salvar);
rotas.delete("/me/exams/:codigoExame", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.remover);
rotas.post("/me/availability", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, disponibilidade.publicar);
rotas.delete("/me/availability/:dataHora", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, disponibilidade.remover);
rotas.get("/:uid/availability", disponibilidade.listar);
rotas.get("/:uid/reviews", avaliacoes.listar);
// Rejected clinics must be able to return their corrected registration for review.
rotas.post("/me/resubmit", autenticarUsuario, reenviarParaAnalise);
rotas.get("/:uid", criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.CLINIC_DETAILS_MAX_PER_MINUTE) || 60,
  mensagem: "Muitas consultas de clínicas em pouco tempo. Aguarde um minuto e tente novamente."
}), controladorDetalhes.obterDetalhes);

module.exports = rotas;
