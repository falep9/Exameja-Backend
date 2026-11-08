const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");
const { calcularTransicaoClinica } = require("../utils/clinicStatus");

const COLECAO_USUARIOS = "usuarios";
const COLECAO_CPFS = "cpf_hashes";
const COLECAO_NOTIFICACOES = "notificacoes";

function mensagemNotificacaoStatus(acao, motivo) {
  const mensagens = {
    aprovar: ["Clínica aprovada", "O cadastro da sua clínica foi aprovado."],
    rejeitar: ["Cadastro precisa de ajustes", "O cadastro da sua clínica foi rejeitado."],
    suspender: ["Clínica suspensa", "O acesso da sua clínica foi suspenso."],
    reativar: ["Clínica reativada", "O acesso da sua clínica foi reativado."],
    reaprovacao_por_alteracao_cadastral: ["Perfil em análise", "Seu perfil foi encaminhado para nova análise após uma alteração cadastral."]
  };
  const [titulo, mensagem] = mensagens[acao];
  return {
    tipo: "status_clinica",
    titulo,
    mensagem,
    ...(acao === "rejeitar" && motivo ? { motivo } : {})
  };
}

async function buscarPerfil(idUsuario) {
  const documento = await obterBancoFirestore().collection(COLECAO_USUARIOS).doc(idUsuario).get();
  return documento.exists ? documento.data() : null;
}

async function criarPerfil(idUsuario, perfil) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_USUARIOS);
  const referencia = colecao.doc(idUsuario);
  await banco.runTransaction(async transacao => {
    if (perfil.cpfHash) {
      const referenciaCpf = banco.collection(COLECAO_CPFS).doc(perfil.cpfHash);
      const [reserva, perfilExistente] = await Promise.all([
        transacao.get(referenciaCpf),
        transacao.get(colecao.where("cpfHash", "==", perfil.cpfHash).limit(1))
      ]);
      if (reserva.exists || !perfilExistente.empty) {
        const erro = new Error("Não foi possível salvar a conta com os dados informados.");
        erro.status = 409;
        throw erro;
      }
      transacao.create(referenciaCpf, { uid: idUsuario, criadoEm: FieldValue.serverTimestamp() });
    }
    transacao.create(referencia, perfil);
  });
}

async function excluirPerfil(idUsuario) {
  await obterBancoFirestore().collection("usuarios").doc(idUsuario).delete();
}

async function atualizarPerfil(idUsuario, atualizacao) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_USUARIOS);
  const referencia = colecao.doc(idUsuario);
  const auditoriaStatus = atualizacao.status ? banco.collection("auditoria_clinicas").doc() : null;
  const notificacaoStatus = atualizacao.status ? banco.collection(COLECAO_NOTIFICACOES).doc() : null;
  await banco.runTransaction(async transacao => {
    const perfilSnapshot = await transacao.get(referencia);
    if (!perfilSnapshot.exists) return;

    if (atualizacao.cpfHash) {
      const hashAnterior = perfilSnapshot.get("cpfHash");
      if (hashAnterior === atualizacao.cpfHash) {
        transacao.update(referencia, { ...atualizacao, atualizadoEm: FieldValue.serverTimestamp() });
        return;
      }
      const referenciaNova = banco.collection(COLECAO_CPFS).doc(atualizacao.cpfHash);
      const referenciaAnterior = hashAnterior
        ? banco.collection(COLECAO_CPFS).doc(hashAnterior)
        : null;
      const leituras = [
        transacao.get(referenciaNova),
        transacao.get(colecao.where("cpfHash", "==", atualizacao.cpfHash).limit(2))
      ];
      if (referenciaAnterior && hashAnterior !== atualizacao.cpfHash) {
        leituras.push(transacao.get(referenciaAnterior));
      }
      const [reservaNova, perfisExistentes, reservaAnterior] = await Promise.all(leituras);
      const pertenceAOutroUsuario = reservaNova.exists && reservaNova.get("uid") !== idUsuario;
      const perfilDeOutroUsuario = perfisExistentes.docs.some(documento => documento.id !== idUsuario);
      if (pertenceAOutroUsuario || perfilDeOutroUsuario) {
        const erro = new Error("Não foi possível salvar o perfil com os dados informados.");
        erro.status = 409;
        throw erro;
      }

      if (!reservaNova.exists) {
        transacao.create(referenciaNova, { uid: idUsuario, criadoEm: FieldValue.serverTimestamp() });
      }
      if (referenciaAnterior && reservaAnterior?.exists && reservaAnterior.get("uid") === idUsuario) {
        transacao.delete(referenciaAnterior);
      }
    }
    const statusAnterior = perfilSnapshot.get("status");
    const mudouStatus = atualizacao.status && atualizacao.status !== statusAnterior;
    if (mudouStatus && perfilSnapshot.get("tipo") === "clinica") {
      const acao = "reaprovacao_por_alteracao_cadastral";
      transacao.create(auditoriaStatus, {
        uidClinica: idUsuario,
        atorUid: idUsuario,
        acao,
        statusAnterior,
        statusNovo: atualizacao.status,
        motivo: null,
        criadoEm: FieldValue.serverTimestamp()
      });
      transacao.create(notificacaoStatus, {
        uidUsuario: idUsuario,
        ...mensagemNotificacaoStatus(acao),
        status: atualizacao.status,
        lida: false,
        criadoEm: FieldValue.serverTimestamp()
      });
    }
    const camposAtualizados = { ...atualizacao, atualizadoEm: FieldValue.serverTimestamp() };
    if (mudouStatus) camposAtualizados.statusAtualizadoEm = FieldValue.serverTimestamp();
    transacao.update(referencia, camposAtualizados);
  });
  const atualizado = await referencia.get();
  return atualizado.exists ? atualizado.data() : null;
}

async function listarClinicasPendentes({ limite = 50, cursor }) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_USUARIOS);
  let consulta = colecao.where("tipo", "==", "clinica")
    .where("status", "==", "pendente")
    .orderBy("criadoEm", "asc");

  if (cursor !== undefined) {
    if (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 128 || cursor.includes("/")) {
      const erro = new Error("Cursor de paginação inválido.");
      erro.status = 400;
      throw erro;
    }
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists || documentoCursor.get("tipo") !== "clinica") {
      const erro = new Error("Cursor de paginação não encontrado.");
      erro.status = 400;
      throw erro;
    }
    consulta = consulta.startAfter(documentoCursor);
  }

  const snapshot = await consulta.limit(limite + 1).get();
  const temMais = snapshot.docs.length > limite;
  const documentos = snapshot.docs.slice(0, limite);
  return {
    clinicas: documentos.map(documento => ({ uid: documento.id, ...documento.data() })),
    proximoCursor: temMais ? documentos[documentos.length - 1].id : null
  };
}

async function decidirStatusClinica({ uid, acao, atorUid, motivo }) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO_USUARIOS).doc(uid);
  const auditoria = banco.collection("auditoria_clinicas").doc();
  const notificacao = acao === "reenviar" ? null : banco.collection(COLECAO_NOTIFICACOES).doc();

  return banco.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (!documento.exists || documento.get("tipo") !== "clinica") {
      const erro = new Error("Clínica não encontrada.");
      erro.status = 404;
      throw erro;
    }

    const statusAnterior = documento.get("status");
    const novoStatus = calcularTransicaoClinica(statusAnterior, acao);
    const agora = FieldValue.serverTimestamp();
    transacao.update(referencia, {
      status: novoStatus,
      motivoStatus: motivo || null,
      ...(acao !== "reenviar" ? { decididoPor: atorUid, decididoEm: agora } : {}),
      atualizadoEm: agora,
      statusAtualizadoEm: agora
    });
    transacao.create(auditoria, {
      uidClinica: uid,
      atorUid,
      acao,
      statusAnterior,
      statusNovo: novoStatus,
      ...(acao !== "reenviar" ? { decididoPor: atorUid, decididoEm: agora } : {}),
      motivo: motivo || null,
      criadoEm: agora
    });
    if (notificacao) {
      transacao.create(notificacao, {
        uidUsuario: uid,
        ...mensagemNotificacaoStatus(acao, motivo),
        status: novoStatus,
        lida: false,
        criadoEm: agora
      });
    }
    return { uid, status: novoStatus };
  });
}

async function listarNotificacoes(uidUsuario, { limite = 20, cursor } = {}) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_NOTIFICACOES);
  let consulta = colecao.where("uidUsuario", "==", uidUsuario).orderBy("criadoEm", "desc");
  if (cursor !== undefined) {
    if (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 150 || cursor.includes("/")) {
      const erro = new Error("Cursor de paginação inválido.");
      erro.status = 400;
      throw erro;
    }
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists || documentoCursor.get("uidUsuario") !== uidUsuario) {
      const erro = new Error("Cursor de paginação não encontrado.");
      erro.status = 400;
      throw erro;
    }
    consulta = consulta.startAfter(documentoCursor);
  }
  const snapshot = await consulta.limit(limite + 1).get();
  const temMais = snapshot.docs.length > limite;
  const documentos = snapshot.docs.slice(0, limite);
  return {
    notificacoes: documentos.map(documento => ({ id: documento.id, ...documento.data() })),
    proximoCursor: temMais ? documentos[documentos.length - 1].id : null
  };
}

async function marcarNotificacaoComoLida(uidUsuario, idNotificacao) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO_NOTIFICACOES).doc(idNotificacao);
  const atualizada = await banco.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (!documento.exists || documento.get("uidUsuario") !== uidUsuario) return false;
    if (!documento.get("lida")) {
      transacao.update(referencia, { lida: true, lidaEm: FieldValue.serverTimestamp() });
    }
    return true;
  });
  return atualizada;
}

module.exports = {
  buscarPerfil,
  criarPerfil,
  excluirPerfil,
  atualizarPerfil,
  listarClinicasPendentes,
  decidirStatusClinica,
  listarNotificacoes,
  marcarNotificacaoComoLida
};
