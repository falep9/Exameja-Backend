const { FieldValue } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO_USUARIOS = "usuarios";
const COLECAO_CPFS = "cpf_hashes";

async function buscarPerfil(idUsuario) {
  const documento = await obterBancoFirestore().collection(COLECAO_USUARIOS).doc(idUsuario).get();
  return documento.exists ? documento.data() : null;
}

async function criarPerfil(idUsuario, perfil) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_USUARIOS);
  const referencia = colecao.doc(idUsuario);
  await banco.runTransaction(async transacao => {
    if (perfil.cpfHash) {
      const referenciaCpf = banco.collection(COLECAO_CPFS).doc(perfil.cpfHash);
      const [reserva, perfilExistente] = await Promise.all([
        transacao.get(referenciaCpf),
        transacao.get(colecao.where("cpfHash", "==", perfil.cpfHash).limit(1))
      ]);
      if (reserva.exists || !perfilExistente.empty) {
        const erro = new Error("Não foi possível salvar a conta com os dados informados.");
        erro.status = 409;
        throw erro;
      }
      transacao.create(referenciaCpf, { uid: idUsuario, criadoEm: FieldValue.serverTimestamp() });
    }
    transacao.create(referencia, perfil);
  });
}

async function excluirPerfil(idUsuario) {
  await obterBancoFirestore().collection("usuarios").doc(idUsuario).delete();
}

async function atualizarPerfil(idUsuario, atualizacao) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_USUARIOS);
  const referencia = colecao.doc(idUsuario);
  await banco.runTransaction(async transacao => {
    const perfilSnapshot = await transacao.get(referencia);
    if (!perfilSnapshot.exists) return;

    if (atualizacao.cpfHash) {
      const hashAnterior = perfilSnapshot.get("cpfHash");
      const referenciaNova = banco.collection(COLECAO_CPFS).doc(atualizacao.cpfHash);
      const referenciaAnterior = hashAnterior
        ? banco.collection(COLECAO_CPFS).doc(hashAnterior)
        : null;
      const leituras = [
        transacao.get(referenciaNova),
        transacao.get(colecao.where("cpfHash", "==", atualizacao.cpfHash).limit(2))
      ];
      if (referenciaAnterior && hashAnterior !== atualizacao.cpfHash) {
        leituras.push(transacao.get(referenciaAnterior));
      }
      const [reservaNova, perfisExistentes, reservaAnterior] = await Promise.all(leituras);
      const pertenceAOutroUsuario = reservaNova.exists && reservaNova.get("uid") !== idUsuario;
      const perfilDeOutroUsuario = perfisExistentes.docs.some(documento => documento.id !== idUsuario);
      if (pertenceAOutroUsuario || perfilDeOutroUsuario) {
        const erro = new Error("Não foi possível salvar o perfil com os dados informados.");
        erro.status = 409;
        throw erro;
      }

      if (!reservaNova.exists) {
        transacao.create(referenciaNova, { uid: idUsuario, criadoEm: FieldValue.serverTimestamp() });
      }
      if (referenciaAnterior && hashAnterior !== atualizacao.cpfHash
        && reservaAnterior?.exists && reservaAnterior.get("uid") === idUsuario) {
        transacao.delete(referenciaAnterior);
      }
    }
    transacao.update(referencia, { ...atualizacao, atualizadoEm: FieldValue.serverTimestamp() });
  });
  const atualizado = await referencia.get();
  return atualizado.exists ? atualizado.data() : null;
}

module.exports = { buscarPerfil, criarPerfil, excluirPerfil, atualizarPerfil };
