const {
  listarDenuncias,
  atualizarDenuncia
} = require("../services/adminReportsService");

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await listarDenuncias(requisicao.query);
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function atualizar(requisicao, resposta, proximaFuncao) {
  try {
    const denuncia = await atualizarDenuncia(
      requisicao.usuario,
      requisicao.params.id,
      requisicao.body
    );
    return resposta.status(200).json(denuncia);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listar, atualizar };
