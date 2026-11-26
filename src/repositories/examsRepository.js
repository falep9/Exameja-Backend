const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO = "catalogo_exames";

async function buscarExameCatalogado(codigo) {
  const documento = await obterBancoFirestore().collection(COLECAO).doc(codigo).get();
  return documento.exists ? { codigo: documento.id, ...documento.data() } : null;
}

async function salvarExameCatalogo(exame) {
  const referencia = obterBancoFirestore().collection(COLECAO).doc(exame.codigo);
  await referencia.set({
    nome: exame.nome,
    tabela: exame.tabela || "TUSS",
    atualizadoEm: FieldValue.serverTimestamp()
  }, { merge: true });
  return exame;
}

async function buscarExamesCatalogados(codigos) {
  const banco = obterBancoFirestore();
  const documentos = await banco.getAll(...codigos.map(codigo => banco.collection(COLECAO).doc(codigo)));
  return documentos.filter(documento => documento.exists)
    .map(documento => ({ codigo: documento.id, ...documento.data() }));
}

module.exports = { buscarExameCatalogado, buscarExamesCatalogados, salvarExameCatalogo };
