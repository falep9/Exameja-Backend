const { registrar: registrarUsuario, autenticar: autenticarUsuario } = require("../services/authService");
const { validarCadastro, validarEmail, validarSenha } = require("../validators/authValidator");
const { obterAutenticacaoFirebase } = require("../config/firebase");
const { buscarPerfil } = require("../repositories/usersRepository");
const { obterNomeUsuario } = require("../utils/nomeUsuario");
const { reenviarVerificacaoEmail, enviarRedefinicaoSenha } = require("../services/firebaseEmailService");
const {
  DURACAO_SESSAO_MS,
  COOKIE_CSRF,
  criarTokenCsrf,
  lerCookies,
  opcoesCookie,
  definirCookiesSessao,
  limparCookiesSessao
} = require("../utils/sessionCookies");

const ESTADOS_VALIDOS_POR_TIPO = Object.freeze({
  cliente: new Set(["ativo"]),
  clinica: new Set(["pendente", "aprovada", "rejeitada", "suspensa"])
});

async function registrar(requisicao, resposta, proximaFuncao) {
  try {
    const dados = validarCadastro(requisicao.body);
    const resultado = await registrarUsuario(dados);
    return resposta.status(201).json({
      message: "Cadastro criado. Verifique seu e-mail para ativar a conta.",
      usuario: {
        uid: resultado.uid,
        id: resultado.uid,
        email: resultado.email,
        tipo: resultado.tipo,
        nome: resultado.nome,
        status: resultado.status
      }
    });
  } catch (erro) {
    if (["auth/email-already-exists", "auth/invalid-email"].includes(erro.code)) {
      return resposta.status(erro.code === "auth/email-already-exists" ? 409 : 400).json({
        message: erro.code === "auth/email-already-exists" ? "Este e-mail já está cadastrado." : "Informe um endereço de e-mail válido."
      });
    }
    if (erro.code && erro.code.startsWith("auth/")) {
      return resposta.status(400).json({
        message: "Não foi possível criar a conta com os dados informados."
      });
    }
    return proximaFuncao(erro);
  }
}

async function login(requisicao, resposta, proximaFuncao) {
  try {
    const email = validarEmail(requisicao.body?.email);
    const senha = validarSenha(requisicao.body?.senha);
    const credenciais = await autenticarUsuario(email, senha);
    const perfil = await buscarPerfil(credenciais.localId);
    if (!perfil || perfil.uid !== credenciais.localId || !["cliente", "clinica"].includes(perfil.tipo)) {
      return resposta.status(403).json({ message: "O perfil da conta não está disponível." });
    }
    if (!credenciais.emailVerified) return resposta.status(403).json({ message: "Verifique seu e-mail antes de iniciar sessão." });
    if (!ESTADOS_VALIDOS_POR_TIPO[perfil.tipo]?.has(perfil.status)) {
      return resposta.status(403).json({ message: "O estado da conta não permite iniciar sessão." });
    }
    resposta.set("Cache-Control", "no-store");
    return resposta.status(200).json({
      token: credenciais.idToken,
      tokenType: "Bearer",
      expiresIn: Number(credenciais.expiresIn),
      usuario: { id: perfil.uid, uid: perfil.uid, nome: obterNomeUsuario(perfil), email: perfil.email, tipo: perfil.tipo }
    });
  } catch (erro) {
    if (erro.status === 401) return resposta.status(401).json({ message: "E-mail ou senha inválidos." });
    return proximaFuncao(erro);
  }
}

async function obterMinhaSessao(requisicao, resposta, proximaFuncao) {
  try {
    const perfil = await buscarPerfil(requisicao.usuario.uid);
    if (!perfil) return resposta.status(404).json({ message: "Perfil não encontrado." });
    resposta.set("Cache-Control", "no-store");
    return resposta.status(200).json({ usuario: {
      id: perfil.uid, uid: perfil.uid, nome: obterNomeUsuario(perfil),
      email: perfil.email, tipo: perfil.tipo, status: perfil.status
    } });
  } catch (erro) { return proximaFuncao(erro); }
}

async function criarSessao(requisicao, resposta, proximaFuncao) {
  try {
    const bearer = (requisicao.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
    if (!bearer) return resposta.status(401).json({ message: "ID token Firebase necessário para iniciar sessão." });
    const auth = obterAutenticacaoFirebase();
    const token = await auth.verifyIdToken(bearer[1], true);
    const agoraSegundos = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(token.auth_time) || token.auth_time > agoraSegundos || agoraSegundos - token.auth_time > 5 * 60) {
      return resposta.status(401).json({ message: "Faça login novamente para iniciar uma nova sessão." });
    }
    if (!token.email_verified) return resposta.status(403).json({ message: "Verifique seu e-mail antes de iniciar sessão." });
    const perfil = await buscarPerfil(token.uid);
    if (!perfil || perfil.uid !== token.uid || !["cliente", "clinica"].includes(perfil.tipo)) {
      return resposta.status(403).json({ message: "O perfil da conta não está disponível." });
    }
    if (!ESTADOS_VALIDOS_POR_TIPO[perfil.tipo].has(perfil.status)) {
      return resposta.status(403).json({ message: "O estado da conta não permite iniciar sessão." });
    }
    const cookieSessao = await auth.createSessionCookie(bearer[1], { expiresIn: DURACAO_SESSAO_MS });
    const tokenCsrf = lerCookies(requisicao)[COOKIE_CSRF] || criarTokenCsrf();
    definirCookiesSessao(resposta, cookieSessao, tokenCsrf);
    resposta.set("Cache-Control", "no-store");
    return resposta.status(200).json({ message: "Sessão iniciada.", csrfToken: tokenCsrf });
  } catch (erro) {
    if (erro.code && erro.code.startsWith("auth/")) {
      return resposta.status(401).json({ message: "Não foi possível iniciar a sessão. Autentique-se novamente." });
    }
    return proximaFuncao(erro);
  }
}

function obterTokenCsrf(_requisicao, resposta) {
  const tokenCsrf = criarTokenCsrf();
  resposta.cookie(COOKIE_CSRF, tokenCsrf, { ...opcoesCookie(DURACAO_SESSAO_MS), httpOnly: false });
  resposta.set("Cache-Control", "no-store");
  return resposta.status(200).json({ csrfToken: tokenCsrf });
}

async function encerrarSessao(requisicao, resposta, proximaFuncao) {
  const bearer = (requisicao.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const auth = obterAutenticacaoFirebase();
    let uid;
    try {
      const token = await auth.verifyIdToken(bearer[1]);
      uid = token.uid;
    } catch (erro) {
      // Um token inválido ou expirado já não autoriza chamadas; ainda limpa os cookies.
      const tokenSemSessaoValida = new Set([
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/invalid-id-token",
        "auth/argument-error"
      ]).has(erro.code);
      if (!tokenSemSessaoValida) return proximaFuncao(erro);
    }
    if (uid) {
      try {
        await auth.revokeRefreshTokens(uid);
      } catch (erro) {
        limparCookiesSessao(resposta);
        return proximaFuncao(erro);
      }
    }
  }
  limparCookiesSessao(resposta);
  return resposta.status(204).end();
}

async function recuperarSenha(requisicao, resposta, proximaFuncao) {
  try {
    const email = validarEmail(requisicao.body?.email);
    try {
      await enviarRedefinicaoSenha(email);
    } catch (erro) {
      // Respostas iguais para e-mails inexistentes evitam enumeração de contas.
      if (!new Set(["EMAIL_NOT_FOUND", "USER_NOT_FOUND", "INVALID_EMAIL"]).has(erro.codigoFirebase)) throw erro;
    }
    resposta.set("Cache-Control", "no-store");
    return resposta.status(200).json({ message: "Se houver uma conta associada a este e-mail, enviaremos as instruções para redefinir a senha." });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function reenviarVerificacao(requisicao, resposta, proximaFuncao) {
  try {
    const email = validarEmail(requisicao.body?.email);
    await reenviarVerificacaoEmail(email);
    resposta.set("Cache-Control", "no-store");
    return resposta.status(200).json({ message: "Se a conta existir e ainda não estiver verificada, enviaremos um novo link de verificação." });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { registrar, login, obterMinhaSessao, criarSessao, obterTokenCsrf, encerrarSessao, recuperarSenha, reenviarVerificacao };
