const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const {
  criar,
  listar,
  buscarPorId,
  atualizar
} = require("../controllers/appointmentsController");

const rotas = Router();
rotas.use(autenticarUsuario, exigirContaAtiva);
rotas.post("/", criar);
rotas.get("/", listar);
rotas.get("/:id", buscarPorId);
rotas.put("/:id", atualizar);

module.exports = rotas;
