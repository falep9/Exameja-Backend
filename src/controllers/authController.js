const { registrar: registrarUsuario } = require("../services/authService");
const { validarCadastro } = require("../validators/authValidator");
const { obterAutenticacaoFirebase } = require("../config/firebase");
const { buscarPerfil } = require("../repositories/usersRepository");
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
        email: resultado.email,
        tipo: resultado.tipo,
        status: resultado.status
      }
    });
  } catch (erro) {
    if (erro.code && erro.code.startsWith("auth/")) {
      return resposta.status(400).json({
        message: "Não foi possível criar a conta com os dados informados."
      });
    }
    return proximaFuncao(erro);
  }
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

function encerrarSessao(_requisicao, resposta) {
  limparCookiesSessao(resposta);
  return resposta.status(204).end();
}

module.exports = { registrar, criarSessao, obterTokenCsrf, encerrarSessao };
