const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const exigirClinicaAprovada = require("../middleware/exigirClinicaAprovada");
const { sugerirPorConvenio, reenviarParaAnalise } = require("../controllers/clinicsController");

const rotas = Router();
rotas.get("/suggestions", autenticarUsuario, exigirContaAtiva, exigirClinicaAprovada, sugerirPorConvenio);
// Rejected clinics must be able to return their corrected registration for review.
rotas.post("/me/resubmit", autenticarUsuario, reenviarParaAnalise);

module.exports = rotas;
