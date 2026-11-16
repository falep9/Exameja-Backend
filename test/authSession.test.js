const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const configFirebase = require("../src/config/firebase");
const usersRepository = require("../src/repositories/usersRepository");
const obterAuthOriginal = configFirebase.obterAutenticacaoFirebase;
const buscarPerfilOriginal = usersRepository.buscarPerfil;

let perfilAtual;
let tokenAtual;
configFirebase.obterAutenticacaoFirebase = () => ({
  verifyIdToken: async () => tokenAtual,
  createSessionCookie: async () => "cookie-de-teste"
});
usersRepository.buscarPerfil = async () => perfilAtual;

const { criarSessao } = require("../src/controllers/authController");
const exigirClinicaAprovada = require("../src/middleware/exigirClinicaAprovada");

after(() => {
  configFirebase.obterAutenticacaoFirebase = obterAuthOriginal;
  usersRepository.buscarPerfil = buscarPerfilOriginal;
});

function requisicaoSessao() {
  return { get: nome => nome === "authorization" ? "Bearer token-teste" : undefined };
}

function respostaFalsa() {
  return {
    codigo: null,
    corpo: null,
    cookies: [],
    status(codigo) { this.codigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; },
    set() { return this; },
    cookie(...args) { this.cookies.push(args); return this; }
  };
}

async function iniciarComStatus(status, { verificado = true } = {}) {
  perfilAtual = { uid: "uid-teste", tipo: "clinica", status };
  tokenAtual = {
    uid: "uid-teste",
    email: "clinica@exemplo.com",
    email_verified: verificado,
    auth_time: Math.floor(Date.now() / 1000)
  };
  const resposta = respostaFalsa();
  let erro;
  await criarSessao(requisicaoSessao(), resposta, recebido => { erro = recebido; });
  return { resposta, erro };
}

test("clínicas em estados válidos podem iniciar sessão para acessar os próprios dados", async () => {
  for (const status of ["pendente", "aprovada", "rejeitada", "suspensa"]) {
    const { resposta, erro } = await iniciarComStatus(status);
    assert.equal(erro, undefined);
    assert.equal(resposta.codigo, 200);
    assert.equal(resposta.cookies.length, 2);
  }
});

test("nega sessão com e-mail não verificado ou estado de perfil inválido", async () => {
  const naoVerificada = await iniciarComStatus("pendente", { verificado: false });
  assert.equal(naoVerificada.resposta.codigo, 403);

  const estadoInvalido = await iniciarComStatus("em_analise");
  assert.equal(estadoInvalido.resposta.codigo, 403);
});

test("somente clínica aprovada passa pelo middleware de funções exclusivas", () => {
  for (const status of ["pendente", "rejeitada", "suspensa"]) {
    const resposta = respostaFalsa();
    let continuou = false;
    exigirClinicaAprovada({ usuario: { tipo: "clinica", status } }, resposta, () => { continuou = true; });
    assert.equal(continuou, false);
    assert.equal(resposta.codigo, 403);
  }
  let continuou = false;
  exigirClinicaAprovada({ usuario: { tipo: "clinica", status: "aprovada" } }, respostaFalsa(), () => { continuou = true; });
  assert.equal(continuou, true);
});
