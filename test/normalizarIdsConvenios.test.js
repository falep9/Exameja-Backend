const test = require("node:test");
const assert = require("node:assert/strict");
const { paraIdValido, planejarMigracao } = require("../scripts/normalizarIdsConvenios");
const { validarIdsConvenios } = require("../src/validators/conveniosValidator");

test("gera IDs no formato aceito pelo validador de convênios", () => {
  const exemplos = {
    "bradesco saúde": "bradesco-saude",
    "GEAP Saúde": "geap-saude",
    ASSEFAZ: "assefaz",
    "NotreDame Intermédica": "notredame-intermedica",
    "Saúde Caixa": "saude-caixa",
    "  Porto   Saúde ": "porto-saude",
  };
  for (const [antigo, esperado] of Object.entries(exemplos)) {
    assert.equal(paraIdValido(antigo), esperado);
    assert.doesNotThrow(() => validarIdsConvenios([paraIdValido(antigo)]));
  }
  assert.equal(paraIdValido("!!!"), "");
  assert.ok(paraIdValido(`a ${"b".repeat(100)}`).length <= 80);
});

test("planeja a troca de IDs, preserva os válidos e atualiza os perfis", () => {
  const convenios = [
    { id: "amil", dados: { nome: "amil", ativo: true } },
    { id: "GEAP Saúde", dados: { nome: "GEAP Saúde", ativo: true } },
    { id: "bradesco saúde", dados: { nome: "bradesco saude", ativo: true } },
    { id: "Bradesco Saúde", dados: { nome: "Bradesco Saúde", ativo: true } },
    { id: "unimed", dados: { nome: "unimed", ativo: true } },
  ];
  const usuarios = [
    { id: "p1", dados: { tipo: "cliente", convenios: ["GEAP Saúde"] } },
    { id: "c1", dados: { tipo: "clinica", conveniosAceitos: ["amil", "bradesco saúde", "Bradesco Saúde", "unimed"] } },
    { id: "c2", dados: { tipo: "clinica", conveniosAceitos: ["amil"] } },
    { id: "p2", dados: { tipo: "cliente" } },
  ];
  const plano = planejarMigracao(convenios, usuarios);

  assert.deepEqual(plano.renomear, [
    { antigo: "GEAP Saúde", novo: "geap-saude" },
    { antigo: "bradesco saúde", novo: "bradesco-saude" },
    { antigo: "Bradesco Saúde", novo: "bradesco-saude" },
  ]);
  assert.deepEqual(plano.criar.map(({ id, antigo }) => ({ id, antigo })), [
    { id: "geap-saude", antigo: "GEAP Saúde" },
    { id: "bradesco-saude", antigo: "bradesco saúde" },
  ]);
  assert.deepEqual(plano.atualizarUsuarios, [
    { id: "p1", campos: { convenios: ["geap-saude"] } },
    { id: "c1", campos: { conveniosAceitos: ["amil", "bradesco-saude", "unimed"] } },
  ]);
  assert.deepEqual(plano.semIdPossivel, []);
});

test("não cria um convênio que já existe com o ID novo", () => {
  const plano = planejarMigracao(
    [
      { id: "geap-saude", dados: { nome: "GEAP", ativo: true } },
      { id: "GEAP Saúde", dados: { nome: "GEAP Saúde", ativo: true } },
    ],
    [],
  );
  assert.deepEqual(plano.renomear, [{ antigo: "GEAP Saúde", novo: "geap-saude" }]);
  assert.deepEqual(plano.criar, []);
});

test("ignora convênios já migrados para poder rodar de novo sem efeito", () => {
  const plano = planejarMigracao(
    [
      { id: "geap-saude", dados: { nome: "GEAP Saúde", ativo: true } },
      { id: "GEAP Saúde", dados: { nome: "GEAP Saúde", ativo: false, migradoPara: "geap-saude" } },
    ],
    [{ id: "p1", dados: { convenios: ["geap-saude"] } }],
  );
  assert.deepEqual(plano, { renomear: [], criar: [], atualizarUsuarios: [], semIdPossivel: [] });
});
