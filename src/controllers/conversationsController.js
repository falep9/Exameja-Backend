const { iniciarConversa } = require("../services/conversationsService");

async function iniciar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await iniciarConversa(
      requisicao.usuario,
      requisicao.body?.clinicaUid
    );
    return resposta.status(resultado.criada ? 201 : 200).json(resultado.conversa);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { iniciar };
