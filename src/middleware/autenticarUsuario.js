const { obterAutenticacaoFirebase } = require("../config/firebase");
const { buscarPerfil } = require("../repositories/usersRepository");

async function autenticarUsuario(requisicao, resposta, proximaFuncao) {
  const cabecalho = requisicao.get("authorization") || "";
  const correspondencia = cabecalho.match(/^Bearer\s+(.+)$/i);
  if (!correspondencia) {
    return resposta.status(401).json({ message: "Autenticação necessária." });
  }
  let token;
  try {
    token = await obterAutenticacaoFirebase().verifyIdToken(correspondencia[1], true);
  } catch (erro) {
    if (["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/argument-error"].includes(erro.code)) {
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
  requisicao.usuario = { uid: token.uid, email: token.email, tipo: perfil.tipo, status: perfil.status };
  return proximaFuncao();
}

module.exports = autenticarUsuario;
