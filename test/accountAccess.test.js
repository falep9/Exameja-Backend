const { test } = require("node:test");
const assert = require("node:assert/strict");
const exigirContaAtiva = require("../src/middleware/exigirContaAtiva");
const exigirAdministrador = require("../src/middleware/exigirAdministrador");

function criarResposta() {
  return {
    codigo: null,
    corpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

test("conta suspensa pode autenticar para ler dados próprios, mas não usar funções ativas", () => {
  const resposta = criarResposta();
  let continuou = false;
  exigirContaAtiva({ usuario: { status: "suspensa" } }, resposta, () => { continuou = true; });
  assert.equal(continuou, false);
  assert.equal(resposta.codigo, 403);
});

test("administrador suspenso não pode executar ações administrativas", () => {
  const resposta = criarResposta();
  let continuou = false;
  exigirAdministrador({ usuario: { administrador: true, status: "suspensa" } }, resposta, () => { continuou = true; });
  assert.equal(continuou, false);
  assert.equal(resposta.codigo, 403);
});
