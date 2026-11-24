const { FieldValue, FieldPath } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO = "convenios";

function normalizarConvenio(documento) {
  const dados = documento.data();
  const nome = typeof dados.nome === "string" && dados.nome.trim()
    ? dados.nome.trim()
    : documento.id;
  return { id: documento.id, nome, ativo: dados.ativo === true };
}

async function listarAtivos() {
  const snapshot = await obterBancoFirestore().collection(COLECAO)
    .where("ativo", "==", true).get();
  return snapshot.docs.map(normalizarConvenio)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function buscarPorIds(ids) {
  if (!ids.length) return [];
  const banco = obterBancoFirestore();
  const documentos = await banco.getAll(...ids.map(id => banco.collection(COLECAO).doc(id)));
  return documentos.filter(documento => documento.exists).map(normalizarConvenio);
}

async function criar({ id, nome }) {
  const agora = FieldValue.serverTimestamp();
  await obterBancoFirestore().collection(COLECAO).doc(id).create({
    nome,
    ativo: true,
    criadoEm: agora,
    atualizadoEm: agora
  });
}

async function atualizar(id, campos) {
  const referencia = obterBancoFirestore().collection(COLECAO).doc(id);
  await referencia.update({ ...campos, atualizadoEm: FieldValue.serverTimestamp() });
  const atualizado = await referencia.get();
  return atualizado.exists ? { id: atualizado.id, ...atualizado.data() } : null;
}

async function listarClinicasPorConvenios(ids, { limite = 20, cursor } = {}) {
  if (!ids.length) return { clinicas: [], proximoCursor: null };
  const colecao = obterBancoFirestore().collection("usuarios");
  let consulta = colecao
    .where("tipo", "==", "clinica")
    .where("status", "==", "aprovada")
    .where("conveniosAceitos", "array-contains-any", ids)
    .orderBy(FieldPath.documentId());
  if (cursor !== undefined) {
    const documentoCursor = await colecao.doc(cursor).get();
    const conveniosAceitos = documentoCursor.exists ? documentoCursor.get("conveniosAceitos") : [];
    if (!documentoCursor.exists || documentoCursor.get("tipo") !== "clinica"
      || documentoCursor.get("status") !== "aprovada"
      || !Array.isArray(conveniosAceitos) || !conveniosAceitos.some(id => ids.includes(id))) {
      const erro = new Error("Cursor de paginação não encontrado.");
      erro.status = 400;
      throw erro;
    }
    consulta = consulta.startAfter(documentoCursor);
  }
  const snapshot = await consulta.limit(limite + 1).get();
  const documentos = snapshot.docs.slice(0, limite);
  return {
    clinicas: documentos.map(documento => ({ uid: documento.id, ...documento.data() })),
    proximoCursor: snapshot.docs.length > limite ? documentos[documentos.length - 1].id : null
  };
}

module.exports = { listarAtivos, buscarPorIds, criar, atualizar, listarClinicasPorConvenios };
