const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

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

module.exports = { criarOuBuscarConversa };
