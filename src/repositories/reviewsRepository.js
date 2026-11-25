const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const REVIEWS = "avaliacoes";
const APPOINTMENTS = "agendamentos";
const USERS = "usuarios";

function erro(mensagem, status) {
  const resultado = new Error(mensagem);
  resultado.status = status;
  return resultado;
}

function erroAvaliacaoExistente() {
  const resultado = erro("Este agendamento já foi avaliado.", 409);
  resultado.codigoPublico = "REVIEW_ALREADY_EXISTS";
  return resultado;
}

async function criar({ usuario, agendamentoId, nota, comentario }) {
  const banco = obterBancoFirestore();
  const refAgendamento = banco.collection(APPOINTMENTS).doc(agendamentoId);
  const refReview = banco.collection(REVIEWS).doc(agendamentoId);
  const agora = FieldValue.serverTimestamp();
  await banco.runTransaction(async tx => {
    const agendamento = await tx.get(refAgendamento);
    if (!agendamento.exists) throw erro("Agendamento não encontrado.", 404);
    const dados = agendamento.data();
    if (dados.clienteUid !== usuario.uid || usuario.tipo !== "cliente") throw erro("Somente o paciente do agendamento pode avaliá-lo.", 403);
    const [review, clinica] = await Promise.all([
      tx.get(refReview), tx.get(banco.collection(USERS).doc(dados.clinicaUid))
    ]);
    if (review.exists) throw erroAvaliacaoExistente();
    if (dados.status !== "concluido") throw erro("Só é possível avaliar um agendamento concluído.", 409);
    if (!clinica.exists || clinica.get("tipo") !== "clinica") throw erro("Clínica não encontrada.", 404);
    const quantidade = Number.isSafeInteger(clinica.get("quantidadeAvaliacoes")) ? clinica.get("quantidadeAvaliacoes") : 0;
    const mediaAtual = Number.isFinite(clinica.get("avaliacaoMedia")) ? clinica.get("avaliacaoMedia") : 0;
    tx.create(refReview, {
      clinicaUid: dados.clinicaUid,
      agendamentoId,
      nota,
      ...(comentario ? { comentario } : {}),
      criadoEm: agora
    });
    tx.update(banco.collection(USERS).doc(dados.clinicaUid), {
      avaliacaoMedia: Number(((mediaAtual * quantidade + nota) / (quantidade + 1)).toFixed(2)),
      quantidadeAvaliacoes: quantidade + 1,
      avaliadaEm: agora
    });
  });
  return { id: agendamentoId, nota, ...(comentario ? { comentario } : {}) };
}

async function existeParaAgendamento(agendamentoId) {
  const documento = await obterBancoFirestore().collection(REVIEWS).doc(agendamentoId).get();
  return documento.exists;
}

async function listar(clinicaUid, { limite, cursor }) {
  const banco = obterBancoFirestore();
  let consulta = banco.collection(REVIEWS).where("clinicaUid", "==", clinicaUid).orderBy("criadoEm", "desc");
  if (cursor) {
    const doc = await banco.collection(REVIEWS).doc(cursor).get();
    if (!doc.exists || doc.get("clinicaUid") !== clinicaUid) throw erro("Cursor de paginação não encontrado.", 400);
    consulta = consulta.startAfter(doc);
  }
  const snapshot = await consulta.limit(limite + 1).get();
  const docs = snapshot.docs.slice(0, limite);
  return {
    avaliacoes: docs.map(doc => ({
      id: doc.id,
      nota: doc.get("nota"),
      ...(doc.get("comentario") ? { comentario: doc.get("comentario") } : {}),
      criadoEm: doc.get("criadoEm")?.toDate().toISOString() || null
    })),
    proximoCursor: snapshot.docs.length > limite ? docs[docs.length - 1].id : null
  };
}

module.exports = { criar, listar, existeParaAgendamento };
