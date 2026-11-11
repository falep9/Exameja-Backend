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

module.exports = { buscarConversa, criarOuBuscarConversa, salvarMensagem };
