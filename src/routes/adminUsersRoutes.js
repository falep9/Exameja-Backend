const { Router } = require("express");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const exigirAdministrador = require("../middleware/exigirAdministrador");
const controlador = require("../controllers/adminUsersController");

function criarRotas(funcao) {
  const rotas = Router();
  rotas.use(autenticarUsuario, exigirContaAtiva, exigirAdministrador);
  rotas.get("/", funcao);
  return rotas;
}

module.exports = {
  usuarios: criarRotas(controlador.listarUsuarios),
  estabelecimentos: criarRotas(controlador.listarClinicas)
};
