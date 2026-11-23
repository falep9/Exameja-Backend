const {
  iniciarConversa,
  enviarMensagem,
  listarMensagens: buscarMensagens,
  listarConversas: buscarConversas
} = require("../services/conversationsService");
const { emitirMensagem } = require("../sockets/chatSocket");

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
    try {
      emitirMensagem(requisicao.params.id, mensagem);
    } catch (erro) {
      console.error("Falha ao emitir mensagem do chat:", erro);
    }
    return resposta.status(201).json(mensagem);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await buscarConversas(requisicao.usuario, {
      limite: requisicao.query.limite,
      cursor: requisicao.query.cursor
    });
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listarMensagens(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await buscarMensagens(requisicao.usuario, requisicao.params.id, {
      limite: requisicao.query.limite,
      cursor: requisicao.query.cursor
    });
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { iniciar, enviar, listar, listarMensagens };
