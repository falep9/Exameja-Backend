const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { createHash } = require("node:crypto");
const { obterBancoFirestore } = require("../config/firebase");

const DISPONIVEIS = "horariosDisponiveis";
const OCUPADOS = "horariosOcupados";

function idHorario(uid, dataHora) {
  return createHash("sha256").update(`${uid}\0${dataHora.toDate().toISOString()}`).digest("hex");
}

function erro(mensagem, status) {
  const resultado = new Error(mensagem);
  resultado.status = status;
  return resultado;
}

async function publicarHorarios(uidClinica, horarios) {
  const banco = obterBancoFirestore();
  const refs = horarios.map(dataHora => banco.collection(DISPONIVEIS).doc(idHorario(uidClinica, dataHora)));
  await banco.runTransaction(async tx => {
    const snapshots = await tx.getAll(...refs);
    const ocupados = await tx.getAll(...horarios.map(dataHora => banco.collection(OCUPADOS)
      .doc(`${uidClinica}_${dataHora.toDate().toISOString()}`)));
    if (ocupados.some(item => item.exists)) throw erro("Um ou mais horários já estão reservados.", 409);
    snapshots.forEach((item, indice) => {
      if (!item.exists) tx.create(refs[indice], {
        uidClinica,
        dataHora: horarios[indice],
        criadoEm: FieldValue.serverTimestamp()
      });
    });
  });
  return { publicados: horarios.length };
}

async function removerHorario(uidClinica, dataHora) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(DISPONIVEIS).doc(idHorario(uidClinica, dataHora));
  const referenciaOcupada = banco.collection(OCUPADOS).doc(`${uidClinica}_${dataHora.toDate().toISOString()}`);
  await banco.runTransaction(async tx => {
    const [slot, ocupado] = await Promise.all([tx.get(referencia), tx.get(referenciaOcupada)]);
    if (!slot.exists) throw erro("Horário não encontrado.", 404);
    if (ocupado.exists) throw erro("Não é possível remover um horário reservado.", 409);
    tx.delete(referencia);
  });
}

async function listarHorarios(uidClinica, { inicio, fim, limite, cursor }) {
  const banco = obterBancoFirestore();
  let consulta = banco.collection(DISPONIVEIS)
    .where("uidClinica", "==", uidClinica)
    .where("dataHora", ">=", Timestamp.fromDate(inicio))
    .where("dataHora", "<=", Timestamp.fromDate(fim))
    .orderBy("dataHora", "asc");
  if (cursor) {
    const doc = await banco.collection(DISPONIVEIS).doc(cursor).get();
    if (!doc.exists || doc.get("uidClinica") !== uidClinica) throw erro("Cursor de paginação não encontrado.", 400);
    consulta = consulta.startAfter(doc);
  }
  const pagina = await consulta.limit(limite + 1).get();
  const docs = pagina.docs.slice(0, limite);
  const ocupados = docs.length ? await banco.getAll(...docs.map(doc => banco.collection(OCUPADOS)
    .doc(`${uidClinica}_${doc.get("dataHora").toDate().toISOString()}`))) : [];
  return {
    horarios: docs.filter((_doc, indice) => !ocupados[indice]?.exists)
      .map(doc => ({ dataHora: doc.get("dataHora").toDate().toISOString() })),
    proximoCursor: pagina.docs.length > limite ? docs[docs.length - 1].id : null
  };
}

module.exports = { idHorario, publicarHorarios, removerHorario, listarHorarios };
