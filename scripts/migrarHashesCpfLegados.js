require("dotenv").config();

const { FieldValue } = require("firebase-admin/firestore");
const { firebaseEstaConfigurado, obterBancoFirestore } = require("../src/config/firebase");

async function migrar() {
  if (!firebaseEstaConfigurado()) {
    throw new Error("Configure as credenciais do Firebase antes de executar a migração.");
  }

  const banco = obterBancoFirestore();
  const colecao = banco.collection("usuarios");
  let consulta = colecao.where("tipo", "==", "cliente").orderBy("tipo").limit(400);
  let removidos = 0;

  while (true) {
    const snapshot = await consulta.get();
    if (snapshot.empty) break;

    const lote = banco.batch();
    let alteracoesNoLote = 0;
    for (const documento of snapshot.docs) {
      if (Object.hasOwn(documento.data(), "cpfHash")) {
        lote.update(documento.ref, { cpfHash: FieldValue.delete() });
        alteracoesNoLote += 1;
      }
    }
    if (alteracoesNoLote) {
      await lote.commit();
      removidos += alteracoesNoLote;
    }

    if (snapshot.size < 400) break;
    consulta = consulta.startAfter(snapshot.docs[snapshot.docs.length - 1]);
  }

  process.stdout.write(`Campo cpfHash removido de ${removidos} perfis; reservas de unicidade preservadas.\n`);
}

migrar().catch(erro => {
  process.stderr.write(`Falha na migração de hashes CPF: ${erro.message}\n`);
  process.exitCode = 1;
});
