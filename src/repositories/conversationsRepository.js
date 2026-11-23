const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

async function buscarConversa(id) {
  const documento = await obterBancoFirestore().collection("conversas").doc(id).get();
  return documento.exists ? { id: documento.id, ...documento.data() } : null;
}

async function criarOuBuscarConversa({ clienteUid, clinicaUid }) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection("conversas").doc(`${clienteUid}_${clinicaUid}`);
  const resultado = await banco.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (documento.exists) {
      return {
        criada: false,
        conversa: { id: referencia.id, ...documento.data() }
      };
    }

    transacao.create(referencia, {
      clienteUid,
      clinicaUid,
      ultimaMensagem: null,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp()
    });
    return { criada: true };
  });

  if (!resultado.criada) return resultado;

  const documento = await referencia.get();
  return {
    criada: true,
    conversa: { id: referencia.id, ...documento.data() }
  };
}

async function salvarMensagem({ conversaId, remetenteUid, texto }) {
  const banco = obterBancoFirestore();
  const conversaRef = banco.collection("conversas").doc(conversaId);
  const mensagemRef = conversaRef.collection("mensagens").doc();
  const criadoEm = FieldValue.serverTimestamp();
  const lote = banco.batch();

  lote.set(mensagemRef, { remetenteUid, texto, criadoEm });
  lote.update(conversaRef, {
    ultimaMensagem: texto.slice(0, 100),
    atualizadoEm: FieldValue.serverTimestamp()
  });
  await lote.commit();

  const documento = await mensagemRef.get();
  return { id: documento.id, ...documento.data() };
}

async function listarMensagens({ conversaId, limite, cursor }) {
  const colecao = obterBancoFirestore().collection("conversas").doc(conversaId).collection("mensagens");
  let consulta = colecao.orderBy("criadoEm", "desc");

  if (cursor !== undefined) {
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists) {
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
    mensagens: documentos.map(documento => ({
      id: documento.id,
      remetenteUid: documento.get("remetenteUid"),
      texto: documento.get("texto"),
      criadoEm: documento.get("criadoEm")
    })),
    proximoCursor: temMais ? documentos[documentos.length - 1].id : null
  };
}

async function listarConversas({ campoUsuario, usuarioUid, limite, cursor }) {
  const colecao = obterBancoFirestore().collection("conversas");
  let consulta = colecao.where(campoUsuario, "==", usuarioUid)
    .orderBy("atualizadoEm", "desc");

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
  const temMais = snapshot.docs.length > limite;
  const documentos = snapshot.docs.slice(0, limite);
  return {
    conversas: documentos.map(documento => ({
      id: documento.id,
      clienteUid: documento.get("clienteUid"),
      clinicaUid: documento.get("clinicaUid"),
      ultimaMensagem: documento.get("ultimaMensagem"),
      atualizadoEm: documento.get("atualizadoEm")
    })),
    proximoCursor: temMais ? documentos[documentos.length - 1].id : null
  };
}

module.exports = {
  buscarConversa,
  criarOuBuscarConversa,
  salvarMensagem,
  listarMensagens,
  listarConversas
};
