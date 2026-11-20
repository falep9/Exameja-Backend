const {
  avaliarClinica,
  listarAvaliacoes: buscarAvaliacoes
} = require("../services/reviewsService");

async function avaliar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await avaliarClinica(requisicao.usuario, requisicao.body);
    return resposta.status(resultado.criada ? 201 : 200).json(resultado.avaliacao);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await buscarAvaliacoes({
      clinicaUid: requisicao.query.clinicaUid,
      limite: requisicao.query.limite,
      cursor: requisicao.query.cursor
    });
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { avaliar, listar };
