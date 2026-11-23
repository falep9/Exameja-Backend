const {
  listarUsuarios: buscarUsuarios,
  listarClinicas: buscarClinicas
} = require("../services/adminUsersService");

async function listarUsuarios(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await buscarUsuarios(requisicao.query);
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listarClinicas(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await buscarClinicas(requisicao.query);
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listarUsuarios, listarClinicas };
