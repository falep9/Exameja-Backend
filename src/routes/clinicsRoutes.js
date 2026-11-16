const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const exigirClinicaAprovada = require("../middleware/exigirClinicaAprovada");
const { sugerirPorConvenio, reenviarParaAnalise } = require("../controllers/clinicsController");
const controladorBusca = require("../controllers/clinicSearchController");
const controladorOfertas = require("../controllers/clinicOffersController");
const criarLimitador = require("../middleware/limitarRequisicoes");

const rotas = Router();
rotas.get("/search", criarLimitador({
  janelaMs: 60 * 1000,
  maximo: Number(process.env.CLINIC_SEARCH_MAX_PER_MINUTE) || 30,
  mensagem: "Muitas buscas em pouco tempo. Aguarde um minuto e tente novamente."
}), controladorBusca.buscar);
rotas.get("/suggestions", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, sugerirPorConvenio);
rotas.get("/me/exams", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.listar);
rotas.get("/me/exams/:codigoExame/history", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.listarHistorico);
rotas.put("/me/exams/:codigoExame", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.salvar);
rotas.delete("/me/exams/:codigoExame", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, controladorOfertas.remover);
// Rejected clinics must be able to return their corrected registration for review.
rotas.post("/me/resubmit", autenticarUsuario, reenviarParaAnalise);

module.exports = rotas;
