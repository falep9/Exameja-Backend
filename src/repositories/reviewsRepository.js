const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

async function salvarAvaliacao({ clienteUid, clinicaUid, nota, comentario }) {
  const banco = obterBancoFirestore();
  const referenciaAvaliacao = banco.collection("avaliacoes").doc(`${clienteUid}_${clinicaUid}`);
  const referenciaClinica = banco.collection("usuarios").doc(clinicaUid);
  const criada = await banco.runTransaction(async transacao => {
    const [avaliacao, clinica] = await Promise.all([
      transacao.get(referenciaAvaliacao),
      transacao.get(referenciaClinica)
    ]);

    if (!clinica.exists || clinica.get("tipo") !== "clinica") {
      const erro = new Error("Clínica não encontrada.");
      erro.status = 404;
      throw erro;
    }
    if (clinica.get("status") !== "aprovada") {
      const erro = new Error("A clínica ainda não foi aprovada.");
      erro.status = 409;
      throw erro;
    }

    const perfil = clinica.data();
    const totalAtual = Number.isFinite(perfil.avaliacoesTotal) ? perfil.avaliacoesTotal : 0;
    const somaAtual = Number.isFinite(perfil.avaliacoesSoma) ? perfil.avaliacoesSoma : 0;
    let novoTotal = totalAtual;
    let novaSoma = somaAtual;

    if (avaliacao.exists) {
      if (avaliacao.get("editada") !== false) {
        const erro = new Error("A avaliação já foi editada uma vez.");
        erro.status = 409;
        throw erro;
      }
      novaSoma = somaAtual - avaliacao.get("nota") + nota;
      transacao.update(referenciaAvaliacao, {
        nota,
        comentario,
        editada: true,
        atualizadoEm: FieldValue.serverTimestamp()
      });
    } else {
      novoTotal += 1;
      novaSoma += nota;
      transacao.create(referenciaAvaliacao, {
        clienteUid,
        clinicaUid,
        nota,
        comentario,
        editada: false,
        criadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp()
      });
    }

    // A avaliação e os contadores são alterados juntos para manter o agregado consistente.
    transacao.update(referenciaClinica, {
      avaliacoesTotal: novoTotal,
      avaliacoesSoma: novaSoma,
      mediaAvaliacoes: novoTotal > 0 ? Number((novaSoma / novoTotal).toFixed(1)) : 0
    });
    return !avaliacao.exists;
  });

  const documento = await referenciaAvaliacao.get();
  return {
    criada,
    avaliacao: { id: documento.id, ...documento.data() }
  };
}

async function listarAvaliacoes({ clinicaUid, limite, cursor }) {
  const colecao = obterBancoFirestore().collection("avaliacoes");
  let consulta = colecao.where("clinicaUid", "==", clinicaUid)
    .orderBy("atualizadoEm", "desc");

  if (cursor !== undefined) {
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists || documentoCursor.get("clinicaUid") !== clinicaUid) {
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
    avaliacoes: documentos.map(documento => ({
      id: documento.id,
      clienteUid: documento.get("clienteUid"),
      nota: documento.get("nota"),
      comentario: documento.get("comentario"),
      atualizadoEm: documento.get("atualizadoEm")
    })),
    proximoCursor: temMais ? documentos[documentos.length - 1].id : null
  };
}

module.exports = { salvarAvaliacao, listarAvaliacoes };
