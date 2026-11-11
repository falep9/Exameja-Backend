const { iniciarConversa, enviarMensagem } = require("../services/conversationsService");

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

async function enviar(requisicao, resposta, proximaFuncao) {
  try {
    const mensagem = await enviarMensagem(
      requisicao.usuario,
      requisicao.params.id,
      requisicao.body?.texto
    );
    return resposta.status(201).json(mensagem);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { iniciar, enviar };
