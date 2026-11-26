const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO_AGENDAMENTOS = "agendamentos";
const COLECAO_HORARIOS = "horariosOcupados";
const COLECAO_HORARIOS_DISPONIVEIS = "horariosDisponiveis";

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
    cancelar: { origem: ["pendente", "confirmado"], destino: "cancelado" },
    concluir: { origem: ["confirmado"], destino: "concluido" }
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
  const referenciaDisponibilidade = banco.collection(COLECAO_HORARIOS_DISPONIVEIS)
    .doc(require("./availabilityRepository").idHorario(dados.clinicaUid, dados.dataHora));
  const agora = FieldValue.serverTimestamp();

  // A reserva e o agendamento são gravados juntos para evitar colisões.
  await banco.runTransaction(async transacao => {
    const [horario, disponibilidade] = await Promise.all([
      transacao.get(referenciaHorario), transacao.get(referenciaDisponibilidade)
    ]);
    if (horario.exists || !disponibilidade.exists) {
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
    transacao.delete(referenciaDisponibilidade);
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
  let documentos = snapshot.docs.slice(0, limite);
  const agora = Date.now();
  const vencidos = documentos.filter(documento => documento.get("status") === "pendente"
    && documento.get("dataHora")?.toMillis() <= agora);
  if (vencidos.length) {
    await Promise.all(vencidos.map(documento => banco.runTransaction(async transacao => {
      const atual = await transacao.get(documento.ref);
      if (atual.exists && atual.get("status") === "pendente"
        && atual.get("dataHora")?.toMillis() <= Date.now()) {
        transacao.update(documento.ref, {
          status: "expirado",
          motivo: "O horário passou sem confirmação.",
          atualizadoEm: FieldValue.serverTimestamp()
        });
      }
    })));
    const atualizados = await banco.getAll(...documentos.map(documento => documento.ref));
    documentos = atualizados.filter(documento => documento.exists);
  }
  return {
    agendamentos: documentos.map(documento => ({ id: documento.id, ...documento.data() })),
    proximoCursor: snapshot.docs.length > limite ? documentos[documentos.length - 1].id : null
  };
}

async function buscarAgendamento(id) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO_AGENDAMENTOS).doc(id);
  await banco.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (!documento.exists || documento.get("status") !== "pendente") return;
    const dataHora = documento.get("dataHora");
    if (dataHora?.toMillis() <= Date.now()) {
      transacao.update(referencia, {
        status: "expirado",
        motivo: "O horário passou sem confirmação.",
        atualizadoEm: FieldValue.serverTimestamp()
      });
    }
  });
  const documento = await referencia.get();
  return documento.exists ? { id: documento.id, ...documento.data() } : null;
}

async function atualizarAgendamento({ usuario, id, acao, motivo }) {
  const banco = obterBancoFirestore();
  const referenciaAgendamento = banco.collection(COLECAO_AGENDAMENTOS).doc(id);
  const resultado = await banco.runTransaction(async transacao => {
    const documento = await transacao.get(referenciaAgendamento);
    if (!documento.exists) throw erroAgendamentoNaoEncontrado();

    const agendamento = documento.data();
    const refHorario = banco.collection(COLECAO_HORARIOS)
      .doc(`${agendamento.clinicaUid}_${agendamento.dataHora.toDate().toISOString()}`);
    const horarioOcupado = await transacao.get(refHorario);
    const clinicaPodeAgir = ["confirmar", "recusar"].includes(acao)
      && usuario.tipo === "clinica" && usuario.uid === agendamento.clinicaUid;
    const clientePodeAgir = acao === "cancelar"
      && usuario.tipo === "cliente" && usuario.uid === agendamento.clienteUid;
    const clinicaPodeConcluir = acao === "concluir"
      && usuario.tipo === "clinica" && usuario.uid === agendamento.clinicaUid;
    if (!clinicaPodeAgir && !clientePodeAgir && !clinicaPodeConcluir) throw erroAcessoNegado();

    const dataHora = agendamento.dataHora.toDate();
    const agora = new Date();
    if (agendamento.status === "pendente" && dataHora <= agora) {
      transacao.update(referenciaAgendamento, {
        status: "expirado",
        motivo: "O horário passou sem confirmação.",
        atualizadoEm: FieldValue.serverTimestamp()
      });
      return { expirado: true };
    }
    const novoStatus = calcularNovoStatus(agendamento.status, acao);
    if (["confirmar", "recusar", "cancelar"].includes(acao) && dataHora <= agora) {
      const erro = new Error("O horário do agendamento já passou.");
      erro.status = 409;
      throw erro;
    }
    if (acao === "concluir" && dataHora > agora) {
      const erro = new Error("O agendamento ainda não aconteceu.");
      erro.status = 409;
      throw erro;
    }

    const atualizacao = {
      status: novoStatus,
      atualizadoEm: FieldValue.serverTimestamp(),
      ...(acao === "recusar" || acao === "cancelar" ? { motivo: motivo || null } : {})
    };
    if (acao === "confirmar" && !horarioOcupado.exists) {
      const erro = new Error("A reserva do horário não está mais ativa.");
      erro.status = 409;
      throw erro;
    }
    transacao.update(referenciaAgendamento, atualizacao);
    if (acao === "recusar" || acao === "cancelar") {
      if (dataHora > agora) {
        transacao.delete(refHorario);
        const refDisponibilidade = banco.collection(COLECAO_HORARIOS_DISPONIVEIS)
          .doc(require("./availabilityRepository").idHorario(agendamento.clinicaUid, agendamento.dataHora));
        transacao.create(refDisponibilidade, {
          uidClinica: agendamento.clinicaUid,
          dataHora: agendamento.dataHora,
          criadoEm: FieldValue.serverTimestamp()
        });
      }
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
