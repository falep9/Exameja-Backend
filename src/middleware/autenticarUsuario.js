const { obterAutenticacaoFirebase } = require("../config/firebase");
const { buscarPerfil } = require("../repositories/usersRepository");
const { COOKIE_SESSAO, lerCookies } = require("../utils/sessionCookies");

async function autenticarUsuario(requisicao, resposta, proximaFuncao) {
  const cookieSessao = lerCookies(requisicao)[COOKIE_SESSAO];
  if (!cookieSessao) {
    return resposta.status(401).json({ message: "Autenticação necessária." });
  }
  let token;
  try {
    token = await obterAutenticacaoFirebase().verifySessionCookie(cookieSessao, true);
  } catch (erro) {
    if (["auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/invalid-session-cookie", "auth/argument-error"].includes(erro.code)) {
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
  if (perfil.status === "suspensa") return resposta.status(403).json({ message: "Esta conta está suspensa." });
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
