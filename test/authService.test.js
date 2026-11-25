const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const fetchOriginal = global.fetch;
const chaveOriginal = process.env.FIREBASE_WEB_API_KEY;
const firebaseConfig = require("../src/config/firebase");
const obterAuthOriginal = firebaseConfig.obterAutenticacaoFirebase;
process.env.FIREBASE_WEB_API_KEY = "chave-de-teste";
const { autenticar } = require("../src/services/authService");

after(() => {
  global.fetch = fetchOriginal;
  firebaseConfig.obterAutenticacaoFirebase = obterAuthOriginal;
  if (chaveOriginal === undefined) delete process.env.FIREBASE_WEB_API_KEY;
  else process.env.FIREBASE_WEB_API_KEY = chaveOriginal;
});

test("mapeia credenciais recusadas sem revelar se o e-mail existe", async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({ error: { message: "EMAIL_NOT_FOUND" } }) });
  await assert.rejects(autenticar("alguem@example.com", "senha-errada"), {
    status: 401,
    code: "INVALID_CREDENTIALS",
    message: "E-mail ou senha inválidos."
  });
});

test("explica quando o provedor de login está desabilitado", async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({ error: { message: "OPERATION_NOT_ALLOWED" } }) });
  await assert.rejects(autenticar("alguem@example.com", "senha"), {
    status: 503,
    codigoPublico: "LOGIN_PROVIDER_DISABLED",
    message: /não está habilitado/
  });
});

test("separa limite de tentativas do erro de credenciais", async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({ error: { message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }) });
  await assert.rejects(autenticar("alguem@example.com", "senha"), {
    status: 429,
    codigoPublico: "LOGIN_RATE_LIMITED"
  });
});

test("confirma email pelo Admin SDK quando a resposta REST não traz emailVerified", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ localId: "uid-1", idToken: "id-token", expiresIn: "3600" })
  });
  firebaseConfig.obterAutenticacaoFirebase = () => ({
    getUser: async uid => ({ uid, emailVerified: true, disabled: false })
  });
  const credenciais = await autenticar("paciente@example.com", "senha-legada");
  assert.equal(credenciais.emailVerified, true);
  assert.equal(credenciais.idToken, "id-token");
});
