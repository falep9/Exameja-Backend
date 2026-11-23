const { obterBancoFirestore } = require("../config/firebase");

const COLECAO_USUARIOS = "usuarios";

function erroCursorInvalido() {
  const erro = new Error("Cursor de paginação não encontrado.");
  erro.status = 400;
  return erro;
}

async function consultarUsuarios({ tipo, status, limite, cursor }) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_USUARIOS);
  let consulta = colecao;
  if (tipo !== undefined) consulta = consulta.where("tipo", "==", tipo);
  if (status !== undefined) consulta = consulta.where("status", "==", status);
  consulta = consulta.orderBy("criadoEm", "desc");

  if (cursor !== undefined) {
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists
      || (tipo !== undefined && documentoCursor.get("tipo") !== tipo)
      || (status !== undefined && documentoCursor.get("status") !== status)
      || documentoCursor.get("criadoEm") === undefined) {
      throw erroCursorInvalido();
    }
    consulta = consulta.startAfter(documentoCursor);
  }

  const snapshot = await consulta.limit(limite + 1).get();
  const documentos = snapshot.docs.slice(0, limite);
  return {
    usuarios: documentos.map(documento => ({ ...documento.data(), uid: documento.id })),
    proximoCursor: snapshot.docs.length > limite ? documentos[documentos.length - 1].id : null
  };
}

async function listarClinicas({ status, limite, cursor }) {
  const resultado = await consultarUsuarios({
    tipo: "clinica",
    status,
    limite,
    cursor
  });
  return { clinicas: resultado.usuarios, proximoCursor: resultado.proximoCursor };
}

module.exports = { listarUsuarios: consultarUsuarios, listarClinicas };
