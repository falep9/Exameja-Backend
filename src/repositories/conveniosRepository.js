const { FieldValue } = require("firebase-admin/firestore");
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

async function listarClinicasPorConvenios(ids, limite = 50) {
  if (!ids.length) return [];
  const snapshot = await obterBancoFirestore().collection("usuarios")
    .where("tipo", "==", "clinica")
    .where("status", "==", "aprovada")
    .where("conveniosAceitos", "array-contains-any", ids)
    .limit(limite)
    .get();
  return snapshot.docs.map(documento => ({ uid: documento.id, ...documento.data() }));
}

module.exports = { listarAtivos, buscarPorIds, criar, atualizar, listarClinicasPorConvenios };
