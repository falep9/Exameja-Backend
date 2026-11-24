const { obterAutenticacaoFirebase } = require("../config/firebase");
const { buscarPerfil } = require("../repositories/usersRepository");
const { COOKIE_SESSAO, lerCookies } = require("../utils/sessionCookies");

async function autenticarUsuario(requisicao, resposta, proximaFuncao) {
  const bearer = (requisicao.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const cookieSessao = lerCookies(requisicao)[COOKIE_SESSAO];
  if (!bearer && !cookieSessao) {
    return resposta.status(401).json({ message: "Autenticação necessária." });
  }
  let token;
  try {
    token = bearer
      ? await obterAutenticacaoFirebase().verifyIdToken(bearer[1], true)
      : await obterAutenticacaoFirebase().verifySessionCookie(cookieSessao, true);
  } catch (erro) {
    if (["auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/invalid-session-cookie", "auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/argument-error"].includes(erro.code)) {
      return resposta.status(401).json({ message: "Token inválido ou expirado." });
    }
    return proximaFuncao(erro);
  }

  let perfil;
  try {
    perfil = await buscarPerfil(token.uid);
  } catch (erro) {
    return proximaFuncao(erro);
  }
  if (!perfil) return resposta.status(401).json({ message: "Perfil de usuário não encontrado." });
  if (perfil.uid !== token.uid || !["cliente", "clinica"].includes(perfil.tipo)) {
    return resposta.status(403).json({ message: "O perfil da conta está inválido." });
  }
  if (!token.email_verified) return resposta.status(403).json({ message: "Verifique seu e-mail para acessar esta conta." });
  requisicao.usuario = {
    uid: token.uid,
    email: token.email,
    emailVerificado: token.email_verified,
    tipo: perfil.tipo,
    status: perfil.status,
    administrador: token.administrador === true
  };
  return proximaFuncao();
}

module.exports = autenticarUsuario;
