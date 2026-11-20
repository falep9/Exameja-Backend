const { FieldValue } = require("firebase-admin/firestore");
const { obterAutenticacaoFirebase } = require("../config/firebase");
const { criarPerfil, excluirPerfil } = require("../repositories/usersRepository");
const { criarHashCpf } = require("../utils/cpf");
const { criarHashCnpj } = require("../utils/cnpj");
const { enviarVerificacaoEmail } = require("./firebaseEmailService");
const { consultarCnpj, normalizarRazaoSocial } = require("./cnpjService");
const { geocodingEndereco } = require("./geocodingService");

async function registrar(dados) {
  const auth = obterAutenticacaoFirebase();
  let usuario;
  let operacaoConcluida = false;
  try {
    const cpfHash = dados.tipo === "cliente" ? criarHashCpf(dados.cpf) : null;
    const cnpjHash = dados.tipo === "clinica" ? criarHashCnpj(dados.cnpj) : null;
    let cadastroCnpj = null;
    if (dados.tipo === "clinica") {
      cadastroCnpj = await consultarCnpj(dados.cnpj);
      if (!cadastroCnpj.encontrado) {
        const erro = new Error("O CNPJ não foi localizado na consulta cadastral.");
        erro.status = 422;
        throw erro;
      }
      if (normalizarRazaoSocial(cadastroCnpj.razaoSocial) !== normalizarRazaoSocial(dados.razaoSocial)) {
        const erro = new Error("A razão social informada não corresponde ao cadastro do CNPJ.");
        erro.status = 422;
        throw erro;
      }
    }
    const geocodificacaoPromise = dados.tipo === "clinica"
      ? geocodingEndereco(`${dados.endereco}, Brasil`).catch(() => null)
      : Promise.resolve(null);
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
      perfil.telefone = dados.telefone;
      perfil.convenios = [];
    } else {
      Object.assign(perfil, {
        dominioCorporativo: dados.dominioCorporativo,
        razaoSocial: dados.razaoSocial,
        nomeFantasia: dados.nomeFantasia,
        cnpj: dados.cnpj,
        consultaCnpj: {
          fonte: "BrasilAPI",
          razaoSocial: cadastroCnpj.razaoSocial,
          consultadoEm: agora
        },
        declaracaoVinculo: dados.declaracaoVinculo,
        declaracaoVinculoRecebidaEm: agora,
        telefone: dados.telefone,
        endereco: dados.endereco
      });
      perfil.conveniosAceitos = [];
      if (dados.cnes) perfil.cnes = dados.cnes;
      const coordenadas = await geocodificacaoPromise;
      if (coordenadas?.encontrado) {
        Object.assign(perfil, {
          latitude: coordenadas.latitude,
          longitude: coordenadas.longitude,
          enderecoCoordenadas: dados.endereco
        });
      }
    }
    await criarPerfil(usuario.uid, perfil, cpfHash, cnpjHash);
    await enviarVerificacaoEmail(usuario.uid);
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
