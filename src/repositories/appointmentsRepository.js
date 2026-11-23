const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO_AGENDAMENTOS = "agendamentos";
const COLECAO_HORARIOS = "horariosOcupados";

function erroAgendamentoNaoEncontrado() {
  const erro = new Error("Agendamento não encontrado.");
  erro.status = 404;
  return erro;
}

function erroAcessoNegado() {
  const erro = new Error("Ação não permitida para este usuário.");
  erro.status = 403;
  return erro;
}

function calcularNovoStatus(statusAtual, acao) {
  const transicoes = {
    confirmar: { origem: ["pendente"], destino: "confirmado" },
    recusar: { origem: ["pendente"], destino: "recusado" },
    cancelar: { origem: ["pendente", "confirmado"], destino: "cancelado" }
  };
  const transicao = transicoes[acao];
  if (!transicao || !transicao.origem.includes(statusAtual)) {
    const erro = new Error("A ação não é permitida para o estado atual do agendamento.");
    erro.status = 409;
    throw erro;
  }
  return transicao.destino;
}

async function criarAgendamento(dados) {
  const banco = obterBancoFirestore();
  const referenciaAgendamento = banco.collection(COLECAO_AGENDAMENTOS).doc();
  const dataIso = dados.dataHora.toDate().toISOString();
  const referenciaHorario = banco.collection(COLECAO_HORARIOS)
    .doc(`${dados.clinicaUid}_${dataIso}`);
  const agora = FieldValue.serverTimestamp();

  // A reserva e o agendamento são gravados juntos para evitar colisões.
  await banco.runTransaction(async transacao => {
    const horario = await transacao.get(referenciaHorario);
    if (horario.exists) {
      const erro = new Error("Horário indisponível.");
      erro.status = 409;
      throw erro;
    }
    transacao.create(referenciaAgendamento, {
      ...dados,
      status: "pendente",
      criadoEm: agora,
      atualizadoEm: agora
    });
    transacao.create(referenciaHorario, {
      agendamentoId: referenciaAgendamento.id,
      clinicaUid: dados.clinicaUid,
      dataHora: dados.dataHora
    });
  });

  const documento = await referenciaAgendamento.get();
  return { id: documento.id, ...documento.data() };
}

async function listarAgendamentos({ campoUsuario, usuarioUid, limite, cursor }) {
  const colecao = obterBancoFirestore().collection(COLECAO_AGENDAMENTOS);
  let consulta = colecao.where(campoUsuario, "==", usuarioUid).orderBy("dataHora", "asc");
  if (cursor !== undefined) {
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists || documentoCursor.get(campoUsuario) !== usuarioUid) {
      const erro = new Error("Cursor de paginação não encontrado.");
      erro.status = 400;
      throw erro;
    }
    consulta = consulta.startAfter(documentoCursor);
  }

  const snapshot = await consulta.limit(limite + 1).get();
  const documentos = snapshot.docs.slice(0, limite);
  return {
    agendamentos: documentos.map(documento => ({ id: documento.id, ...documento.data() })),
    proximoCursor: snapshot.docs.length > limite ? documentos[documentos.length - 1].id : null
  };
}

async function buscarAgendamento(id) {
  const documento = await obterBancoFirestore().collection(COLECAO_AGENDAMENTOS).doc(id).get();
  return documento.exists ? { id: documento.id, ...documento.data() } : null;
}

async function atualizarAgendamento({ usuario, id, acao, motivo }) {
  const banco = obterBancoFirestore();
  const referenciaAgendamento = banco.collection(COLECAO_AGENDAMENTOS).doc(id);
  const resultado = await banco.runTransaction(async transacao => {
    const documento = await transacao.get(referenciaAgendamento);
    if (!documento.exists) throw erroAgendamentoNaoEncontrado();

    const agendamento = documento.data();
    const clinicaPodeAgir = ["confirmar", "recusar"].includes(acao)
      && usuario.tipo === "clinica" && usuario.uid === agendamento.clinicaUid;
    const clientePodeAgir = acao === "cancelar"
      && usuario.tipo === "cliente" && usuario.uid === agendamento.clienteUid;
    if (!clinicaPodeAgir && !clientePodeAgir) throw erroAcessoNegado();

    const novoStatus = calcularNovoStatus(agendamento.status, acao);
    const atualizacao = {
      status: novoStatus,
      atualizadoEm: FieldValue.serverTimestamp(),
      ...(acao === "recusar" || acao === "cancelar" ? { motivo: motivo || null } : {})
    };
    transacao.update(referenciaAgendamento, atualizacao);
    if (acao === "recusar" || acao === "cancelar") {
      const dataIso = agendamento.dataHora.toDate().toISOString();
      const referenciaHorario = banco.collection(COLECAO_HORARIOS)
        .doc(`${agendamento.clinicaUid}_${dataIso}`);
      transacao.delete(referenciaHorario);
    }
    return true;
  });
  if (!resultado) return null;

  const documentoAtualizado = await referenciaAgendamento.get();
  return { id: documentoAtualizado.id, ...documentoAtualizado.data() };
}

module.exports = {
  criarAgendamento,
  listarAgendamentos,
  buscarAgendamento,
  atualizarAgendamento
};
