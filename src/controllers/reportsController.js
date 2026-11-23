const { criarDenuncia } = require("../services/reportsService");

async function criar(requisicao, resposta, proximaFuncao) {
  try {
    const denuncia = await criarDenuncia(requisicao.usuario, requisicao.body);
    return resposta.status(201).json(denuncia);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { criar };
