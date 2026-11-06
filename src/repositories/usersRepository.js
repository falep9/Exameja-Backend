const { obterBancoFirestore } = require("../config/firebase");

async function buscarPerfil(idUsuario) {
  const documento = await obterBancoFirestore().collection("usuarios").doc(idUsuario).get();
  return documento.exists ? documento.data() : null;
}

async function criarPerfil(idUsuario, perfil) {
  await obterBancoFirestore().collection("usuarios").doc(idUsuario).create(perfil);
}

async function excluirPerfil(idUsuario) {
  await obterBancoFirestore().collection("usuarios").doc(idUsuario).delete();
}

module.exports = { buscarPerfil, criarPerfil, excluirPerfil };
