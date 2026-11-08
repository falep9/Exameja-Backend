const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const { sugerirPorConvenio, reenviarParaAnalise } = require("../controllers/clinicsController");

const rotas = Router();
rotas.get("/suggestions", autenticarUsuario, exigirContaAtiva, sugerirPorConvenio);
rotas.post("/me/resubmit", autenticarUsuario, exigirContaAtiva, reenviarParaAnalise);

module.exports = rotas;
