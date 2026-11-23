const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO_DENUNCIAS = "denuncias";

async function criarDenuncia(dados) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO_DENUNCIAS).doc(dados.id);
  const agora = FieldValue.serverTimestamp();

  // Criar somente se ausente mantém a chave única do denunciante e do alvo.
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

module.exports = { criarDenuncia };
