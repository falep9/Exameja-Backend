const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirAdministrador = require("../middleware/exigirAdministrador");
const controlador = require("../controllers/adminClinicsController");

const rotas = Router();
rotas.use(autenticarUsuario, exigirAdministrador);
rotas.get("/", controlador.listarPendentes);
rotas.post("/:uid/approve", controlador.aprovar);
rotas.post("/:uid/reject", controlador.rejeitar);
rotas.post("/:uid/suspend", controlador.suspender);
rotas.post("/:uid/reactivate", controlador.reativar);

module.exports = rotas;
