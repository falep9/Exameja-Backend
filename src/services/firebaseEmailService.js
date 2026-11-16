const { obterAutenticacaoFirebase } = require("../config/firebase");

const timeoutConfigurado = Number(process.env.EXTERNAL_API_TIMEOUT_MS);
const timeoutMs = Number.isFinite(timeoutConfigurado) && timeoutConfigurado >= 500 && timeoutConfigurado <= 60000
  ? timeoutConfigurado
  : 8000;

function obterChaveApi() {
  const chave = process.env.FIREBASE_WEB_API_KEY;
  if (!chave) {
    const erro = new Error("Configure FIREBASE_WEB_API_KEY para enviar e-mails pelo Firebase Authentication.");
    erro.status = 503;
    throw erro;
  }
  return chave;
}

async function solicitarAcaoFirebase(corpo) {
  const url = new URL("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode");
  url.searchParams.set("key", obterChaveApi());
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controlador.signal
    });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const codigo = resultado.error?.message;
      const erro = new Error("Não foi possível enviar o e-mail solicitado.");
      erro.codigoFirebase = codigo;
      erro.status = resposta.status === 400 && codigo === "INVALID_EMAIL" ? 400 : 502;
      throw erro;
    }
    return resultado;
  } catch (erro) {
    if (erro.status) throw erro;
    const detalhe = erro.name === "AbortError" ? `tempo limite de ${timeoutMs} ms excedido` : erro.message;
    const falha = new Error(`Não foi possível solicitar o e-mail ao Firebase: ${detalhe}`);
    falha.status = 502;
    throw falha;
  } finally {
    clearTimeout(timer);
  }
}

async function enviarVerificacaoEmail(uid) {
  const auth = obterAutenticacaoFirebase();
  const tokenCustomizado = await auth.createCustomToken(uid);
  const url = new URL("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken");
  url.searchParams.set("key", obterChaveApi());
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenCustomizado, returnSecureToken: true }),
      signal: controlador.signal
    });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !resultado.idToken) {
      const erro = new Error("Não foi possível preparar o envio da verificação de e-mail.");
      erro.status = 502;
      throw erro;
    }
    await solicitarAcaoFirebase({ requestType: "VERIFY_EMAIL", idToken: resultado.idToken });
  } catch (erro) {
    if (erro.status) throw erro;
    const falha = new Error("Não foi possível preparar o envio da verificação de e-mail.");
    falha.status = 502;
    throw falha;
  } finally {
    clearTimeout(timer);
  }
}

async function enviarRedefinicaoSenha(email) {
  return solicitarAcaoFirebase({ requestType: "PASSWORD_RESET", email });
}

async function reenviarVerificacaoEmail(email) {
  const auth = obterAutenticacaoFirebase();
  let usuario;
  try {
    usuario = await auth.getUserByEmail(email);
  } catch (erro) {
    if (["auth/user-not-found", "auth/invalid-email"].includes(erro.code)) return;
    throw erro;
  }
  if (!usuario.emailVerified) await enviarVerificacaoEmail(usuario.uid);
}

module.exports = { enviarVerificacaoEmail, reenviarVerificacaoEmail, enviarRedefinicaoSenha };
