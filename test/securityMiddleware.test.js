const { test } = require("node:test");
const assert = require("node:assert/strict");

const nodeEnvOriginal = process.env.NODE_ENV;
const corsOriginal = process.env.CORS_ORIGINS;
process.env.NODE_ENV = "production";
process.env.CORS_ORIGINS = "https://app.exameja.test";

const protegerCsrf = require("../src/middleware/protegerCsrf");
const autenticarUsuario = require("../src/middleware/autenticarUsuario");
const criarLimitador = require("../src/middleware/limitarRequisicoes");
const { COOKIE_CSRF } = require("../src/utils/sessionCookies");

if (nodeEnvOriginal === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = nodeEnvOriginal;
if (corsOriginal === undefined) delete process.env.CORS_ORIGINS;
else process.env.CORS_ORIGINS = corsOriginal;

function criarResposta() {
  return {
    statusCodigo: null,
    headers: {},
    corpo: null,
    set(nome, valor) { this.headers[nome] = valor; return this; },
    status(codigo) { this.statusCodigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

function criarRequisicao({ method = "POST", path = "/api/test", ip = "127.0.0.1", tokenCookie, tokenHeader, origin } = {}) {
  const cookie = tokenCookie === undefined ? "" : `${COOKIE_CSRF}=${encodeURIComponent(tokenCookie)}`;
  return {
    method,
    path,
    ip,
    socket: { remoteAddress: ip },
    get(nome) {
      if (nome.toLowerCase() === "cookie") return cookie;
      if (nome.toLowerCase() === "x-csrf-token") return tokenHeader;
      if (nome.toLowerCase() === "origin") return origin;
      return undefined;
    }
  };
}

test("exige token CSRF correspondente para mutações", () => {
  let proximaChamadas = 0;
  let resposta = criarResposta();
  protegerCsrf(criarRequisicao(), resposta, () => { proximaChamadas += 1; });
  assert.equal(resposta.statusCodigo, 403);

  resposta = criarResposta();
  protegerCsrf(criarRequisicao({ tokenCookie: "cookie-token", tokenHeader: "outro-token" }), resposta,
    () => { proximaChamadas += 1; });
  assert.equal(resposta.statusCodigo, 403);

  resposta = criarResposta();
  protegerCsrf(criarRequisicao({ tokenCookie: "token-correto", tokenHeader: "token-correto" }), resposta,
    () => { proximaChamadas += 1; });
  assert.equal(proximaChamadas, 1);
});

test("bloqueia origem não autorizada mesmo com token CSRF válido", () => {
  const resposta = criarResposta();
  protegerCsrf(criarRequisicao({
    tokenCookie: "token-correto",
    tokenHeader: "token-correto",
    origin: "https://site-malicioso.test"
  }), resposta, () => assert.fail("a origem não autorizada não deve continuar"));
  assert.equal(resposta.statusCodigo, 403);
});

test("não exige CSRF em leitura e exige sessão para rotas protegidas", () => {
  let continuou = false;
  protegerCsrf(criarRequisicao({ method: "GET" }), criarResposta(), () => { continuou = true; });
  assert.equal(continuou, true);

  const resposta = criarResposta();
  autenticarUsuario({ get: () => "" }, resposta, () => assert.fail("sem cookie não deve autenticar"));
  assert.equal(resposta.statusCodigo, 401);
});

test("login Bearer não exige CSRF, mas continua sujeito à validação de origem", () => {
  let continuou = false;
  protegerCsrf(criarRequisicao({ method: "POST", path: "/api/auth/login" }), criarResposta(), () => { continuou = true; });
  assert.equal(continuou, true);

  const resposta = criarResposta();
  protegerCsrf(criarRequisicao({ method: "POST", path: "/api/auth/login", origin: "https://site-malicioso.test" }), resposta,
    () => assert.fail("login deve continuar bloqueando origem não autorizada"));
  assert.equal(resposta.statusCodigo, 403);
});

test("limitador retorna 429 e Retry-After depois do máximo configurado", () => {
  const limitar = criarLimitador({ janelaMs: 60_000, maximo: 1, mensagem: "limite" });
  let chamadas = 0;
  limitar(criarRequisicao({ method: "GET" }), criarResposta(), () => { chamadas += 1; });

  const resposta = criarResposta();
  limitar(criarRequisicao({ method: "GET" }), resposta, () => { chamadas += 1; });

  assert.equal(chamadas, 1);
  assert.equal(resposta.statusCodigo, 429);
  assert.ok(Number(resposta.headers["Retry-After"]) > 0);
});
