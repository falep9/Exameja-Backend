const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calcularTransicaoClinica } = require("../src/utils/clinicStatus");

test("permite as transições previstas no fluxo de aprovação de clínicas", () => {
  assert.equal(calcularTransicaoClinica("pendente", "aprovar"), "aprovada");
  assert.equal(calcularTransicaoClinica("pendente", "rejeitar"), "rejeitada");
  assert.equal(calcularTransicaoClinica("aprovada", "suspender"), "suspensa");
  assert.equal(calcularTransicaoClinica("suspensa", "reativar"), "aprovada");
  assert.equal(calcularTransicaoClinica("rejeitada", "reenviar"), "pendente");
});

test("bloqueia transições fora de ordem e ações desconhecidas", () => {
  for (const [status, acao] of [
    ["aprovada", "aprovar"],
    ["rejeitada", "suspender"],
    ["pendente", "reativar"],
    ["desconhecida", "aprovar"]
  ]) {
    assert.throws(
      () => calcularTransicaoClinica(status, acao),
      erro => erro.status === 409
    );
  }
});
