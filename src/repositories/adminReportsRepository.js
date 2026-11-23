const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO_DENUNCIAS = "denuncias";

function erroDenunciaNaoEncontrada() {
  const erro = new Error("Denúncia não encontrada.");
  erro.status = 404;
  return erro;
}

async function listarDenuncias({ status, alvoTipo, limite, cursor }) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_DENUNCIAS);
  let consulta = colecao;
  if (status !== undefined) consulta = consulta.where("status", "==", status);
  if (alvoTipo !== undefined) consulta = consulta.where("alvoTipo", "==", alvoTipo);
  consulta = consulta.orderBy("criadoEm", "desc");

  if (cursor !== undefined) {
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists
      || (status !== undefined && documentoCursor.get("status") !== status)
      || (alvoTipo !== undefined && documentoCursor.get("alvoTipo") !== alvoTipo)
      || documentoCursor.get("criadoEm") === undefined) {
      const erro = new Error("Cursor de paginação não encontrado.");
      erro.status = 400;
      throw erro;
    }
    consulta = consulta.startAfter(documentoCursor);
  }

  const snapshot = await consulta.limit(limite + 1).get();
  const documentos = snapshot.docs.slice(0, limite);
  return {
    denuncias: documentos.map(documento => ({ id: documento.id, ...documento.data() })),
    proximoCursor: snapshot.docs.length > limite ? documentos[documentos.length - 1].id : null
  };
}

async function criarDenuncia(dados) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO_DENUNCIAS).doc(dados.id);
  const agora = FieldValue.serverTimestamp();

  // A leitura e a criação atômicas impedem duplicar a denúncia.
  await banco.runTransaction(async transacao => {
    const existente = await transacao.get(referencia);
    if (existente.exists) {
      const erro = new Error("Você já denunciou este item.");
      erro.status = 409;
      throw erro;
    }
    const { id, ...campos } = dados;
    transacao.create(referencia, {
      ...campos,
      status: "aberta",
      criadoEm: agora,
      atualizadoEm: agora
    });
  });

  const documento = await referencia.get();
  return { id: documento.id, ...documento.data() };
}

async function atualizarDenuncia({ id, acao, nota, adminUid }) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO_DENUNCIAS).doc(id);
  await banco.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (!documento.exists) throw erroDenunciaNaoEncontrada();
    if (documento.get("status") !== "aberta") {
      const erro = new Error("A denúncia não está aberta.");
      erro.status = 409;
      throw erro;
    }
    const campos = {
      status: acao === "resolver" ? "resolvida" : "descartada",
      nota,
      resolvidaPorUid: adminUid
    };
    transacao.update(referencia, {
      ...campos,
      atualizadoEm: FieldValue.serverTimestamp()
    });
  });
  const documentoAtualizado = await referencia.get();
  return { id: documentoAtualizado.id, ...documentoAtualizado.data() };
}

module.exports = { listarDenuncias, criarDenuncia, atualizarDenuncia };
