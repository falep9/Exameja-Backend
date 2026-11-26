const { FieldValue } = require("firebase-admin/firestore");
const firebaseConfig = require("../config/firebase");
const { criarPerfil, excluirPerfil } = require("../repositories/usersRepository");
const { criarHashCpf } = require("../utils/cpf");
const { criarHashCnpj } = require("../utils/cnpj");
const { enviarVerificacaoEmail } = require("./firebaseEmailService");
const { consultarCnpj, normalizarRazaoSocial } = require("./cnpjService");
const { geocodingEndereco } = require("./geocodingService");
const conveniosRepository = require("../repositories/conveniosRepository");

async function registrar(dados) {
  const auth = firebaseConfig.obterAutenticacaoFirebase();
  let usuario;
  let operacaoConcluida = false;
  try {
    const idsConvenios = dados.convenios || dados.conveniosAceitos || [];
    const catalogoConvenios = await conveniosRepository.buscarPorIds(idsConvenios);
    if (catalogoConvenios.length !== idsConvenios.length || catalogoConvenios.some(convenio => !convenio.ativo)) {
      const erro = new Error("Selecione somente convênios ativos do catálogo.");
      erro.status = 400;
      throw erro;
    }
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
      perfil.convenios = dados.convenios;
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
      perfil.conveniosAceitos = dados.conveniosAceitos;
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
    operacaoConcluida = true;
    let emailVerificacaoEnviado = true;
    try {
      await enviarVerificacaoEmail(usuario.uid);
    } catch {
      // O cadastro permanece válido; a pessoa pode solicitar outro link depois.
      emailVerificacaoEnviado = false;
    }
    return {
      uid: usuario.uid,
      email: usuario.email,
      tipo: dados.tipo,
      nome: dados.nome || dados.nomeFantasia,
      status: perfil.status,
      emailVerificacaoEnviado
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
    const erro = new Error("O serviço de login está temporariamente indisponível. Avise o suporte.");
    erro.status = 503;
    erro.codigoPublico = "LOGIN_CONFIGURATION_ERROR";
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
  } catch (falha) {
    const erro = new Error(falha.name === "AbortError"
      ? "O serviço de login demorou demais para responder. Tente novamente."
      : "Não foi possível conectar ao serviço de login. Verifique a conexão e tente novamente.");
    erro.status = 503;
    erro.codigoPublico = falha.name === "AbortError" ? "LOGIN_TIMEOUT" : "LOGIN_NETWORK_ERROR";
    throw erro;
  } finally {
    clearTimeout(temporizador);
  }
  if (!resposta.ok) {
    const codigo = dados.error?.message;
    if (["INVALID_PASSWORD", "EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS"].includes(codigo)) {
      const erro = new Error("E-mail ou senha inválidos.");
      erro.status = 401;
      erro.code = "INVALID_CREDENTIALS";
      throw erro;
    }
    if (codigo === "USER_DISABLED") {
      const erro = new Error("Esta conta está desativada. Entre em contato com o suporte.");
      erro.status = 403;
      erro.codigoPublico = "ACCOUNT_DISABLED";
      throw erro;
    }
    if (codigo === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      const erro = new Error("Muitas tentativas de login. Aguarde alguns minutos e tente novamente.");
      erro.status = 429;
      erro.codigoPublico = "LOGIN_RATE_LIMITED";
      throw erro;
    }
    const configuracaoInvalida = ["API_KEY_INVALID", "PROJECT_NOT_FOUND", "CONFIGURATION_NOT_FOUND"]
      .includes(codigo);
    const provedorDesativado = codigo === "OPERATION_NOT_ALLOWED";
    const erro = new Error(provedorDesativado
      ? "O login por e-mail e senha não está habilitado no Firebase Authentication. Avise o suporte."
      : configuracaoInvalida
        ? "A configuração do serviço de login está incorreta. Avise o suporte."
        : "O serviço de login não conseguiu validar a solicitação. Tente novamente ou avise o suporte.");
    erro.status = configuracaoInvalida || provedorDesativado ? 503 : 502;
    erro.codigoPublico = provedorDesativado ? "LOGIN_PROVIDER_DISABLED"
      : configuracaoInvalida ? "LOGIN_CONFIGURATION_ERROR" : "LOGIN_PROVIDER_ERROR";
    throw erro;
  }
  // signInWithPassword nem sempre inclui emailVerified na resposta; o Admin SDK
  // é a fonte autoritativa do estado de verificação e da conta Firebase.
  try {
    const usuarioFirebase = await firebaseConfig.obterAutenticacaoFirebase().getUser(dados.localId);
    if (usuarioFirebase.disabled) {
      const erro = new Error("Esta conta está desativada. Entre em contato com o suporte.");
      erro.status = 403;
      erro.codigoPublico = "ACCOUNT_DISABLED";
      throw erro;
    }
    return { ...dados, emailVerified: usuarioFirebase.emailVerified === true, administrador: usuarioFirebase.customClaims?.administrador === true };
  } catch (falha) {
    if (falha.status) throw falha;
    if (falha.code === "auth/user-not-found") {
      const erro = new Error("E-mail ou senha inválidos.");
      erro.status = 401;
      erro.code = "INVALID_CREDENTIALS";
      throw erro;
    }
    const erro = new Error("Não foi possível confirmar o estado da conta no serviço de autenticação. Tente novamente.");
    erro.status = 503;
    erro.codigoPublico = "LOGIN_PROFILE_CHECK_FAILED";
    throw erro;
  }
}

module.exports = { registrar, autenticar };
