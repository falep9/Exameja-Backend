const { FieldValue } = require("firebase-admin/firestore");
const { obterAutenticacaoFirebase } = require("../config/firebase");
const { criarPerfil, excluirPerfil } = require("../repositories/usersRepository");
const { criarHashCpf } = require("../utils/cpf");

async function registrar(dados) {
  const auth = obterAutenticacaoFirebase();
  let usuario;
  let operacaoConcluida = false;
  try {
    let cpfHash;
    if (dados.tipo === "cliente") {
      cpfHash = criarHashCpf(dados.cpf);
    }
    usuario = await auth.createUser({ email: dados.email, password: dados.senha, emailVerified: false });
    const agora = FieldValue.serverTimestamp();
    const perfil = {
      uid: usuario.uid,
      email: dados.email,
      tipo: dados.tipo,
      status: dados.tipo === "clinica" ? "pendente" : "ativo",
      criadoEm: agora,
      atualizadoEm: agora
    };
    if (dados.tipo === "cliente") {
      perfil.cpfHash = cpfHash;
      perfil.telefone = dados.telefone;
      perfil.convenios = [];
    } else {
      Object.assign(perfil, {
        dominioCorporativo: dados.dominioCorporativo,
        razaoSocial: dados.razaoSocial,
        nomeFantasia: dados.nomeFantasia,
        cnpj: dados.cnpj,
        telefone: dados.telefone,
        endereco: dados.endereco
      });
      perfil.conveniosAceitos = [];
      if (dados.cnes) perfil.cnes = dados.cnes;
    }
    await criarPerfil(usuario.uid, perfil);
    operacaoConcluida = true;
    return {
      uid: usuario.uid,
      email: usuario.email,
      tipo: dados.tipo,
      status: perfil.status
    };
  } catch (erro) {
    if (usuario && !operacaoConcluida) {
      try { await excluirPerfil(usuario.uid); } catch { /* documento pode ainda não ter sido criado */ }
      try { await auth.deleteUser(usuario.uid); } catch { /* limpeza best-effort */ }
    }
    throw erro;
  }
}

module.exports = { registrar };
