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
    usuario = await auth.createUser({ email: dados.email, password: dados.senha, emailVerified: false,
      ...(dados.tipo === "cliente" ? { displayName: dados.nome } : { displayName: dados.nomeFantasia }) });
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
      perfil.nome = dados.nome;
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
      nome: dados.nome || dados.nomeFantasia,
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

async function autenticar(email, senha) {
  const chaveApi = process.env.FIREBASE_WEB_API_KEY;
  if (!chaveApi) {
    const erro = new Error("Login indisponível: FIREBASE_WEB_API_KEY não está configurada.");
    erro.status = 503;
    throw erro;
  }
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 8000);
  let resposta;
  let dados;
  try {
    resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(chaveApi)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
      signal: controlador.signal
    });
    dados = await resposta.json().catch(erro => {
      if (controlador.signal.aborted) throw erro;
      return {};
    });
  } catch {
    const erro = new Error("Não foi possível validar as credenciais agora.");
    erro.status = 503;
    throw erro;
  } finally {
    clearTimeout(temporizador);
  }
  if (!resposta.ok) {
    const codigo = dados.error?.message;
    if (["INVALID_PASSWORD", "EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS", "USER_DISABLED"].includes(codigo)) {
      const erro = new Error("E-mail ou senha inválidos.");
      erro.status = 401;
      erro.code = codigo;
      throw erro;
    }
    const erro = new Error(codigo === "TOO_MANY_ATTEMPTS_TRY_LATER"
      ? "Muitas tentativas de login. Tente novamente mais tarde."
      : "Não foi possível validar as credenciais agora.");
    erro.status = codigo === "TOO_MANY_ATTEMPTS_TRY_LATER" ? 429 : 503;
    erro.code = codigo;
    throw erro;
  }
  return dados;
}

module.exports = { registrar, autenticar };
