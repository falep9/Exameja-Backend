const {
  criarAgendamento,
  listarAgendamentos,
  buscarAgendamento,
  atualizarAgendamento
} = require("../services/appointmentsService");

async function criar(requisicao, resposta, proximaFuncao) {
  try {
    const agendamento = await criarAgendamento(requisicao.usuario, requisicao.body);
    return resposta.status(201).json(agendamento);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await listarAgendamentos(requisicao.usuario, {
      limite: requisicao.query.limite,
      cursor: requisicao.query.cursor
    });
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function buscarPorId(requisicao, resposta, proximaFuncao) {
  try {
    const agendamento = await buscarAgendamento(requisicao.usuario, requisicao.params.id);
    return resposta.status(200).json(agendamento);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function atualizar(requisicao, resposta, proximaFuncao) {
  try {
    const agendamento = await atualizarAgendamento(
      requisicao.usuario,
      requisicao.params.id,
      requisicao.body
    );
    return resposta.status(200).json(agendamento);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { criar, listar, buscarPorId, atualizar };
