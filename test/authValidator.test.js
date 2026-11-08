const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validarDocumento, validarEmail, validarCadastro } = require("../src/validators/authValidator");

test("valida e normaliza CPF e CNPJ com dígitos verificadores", () => {
  assert.equal(validarDocumento("529.982.247-25", "CPF", 11), "52998224725");
  assert.equal(validarDocumento("11.222.333/0001-81", "CNPJ", 14), "11222333000181");
});

test("rejeita documento com dígitos verificadores inválidos", () => {
  assert.throws(() => validarDocumento("529.982.247-24", "CPF", 11), { status: 400 });
  assert.throws(() => validarDocumento("11.222.333/0001-80", "CNPJ", 14), { status: 400 });
});

test("normaliza o e-mail e exige que a clínica use o domínio corporativo informado", () => {
  const email = validarEmail("Responsavel@Clinica.Exemplo.br");
  assert.equal(email, "responsavel@clinica.exemplo.br");
  const cadastroBase = {
    tipo: "clinica",
    email,
    senha: "senha-segura-123",
    dominioCorporativo: "@clinica.exemplo.br",
    razaoSocial: "Clínica Exemplo Ltda.",
    nomeFantasia: "Clínica Exemplo",
    cnpj: "11222333000181",
    telefone: "1133334444",
    endereco: "Rua Exemplo, 100",
    declaracaoVinculo: "Declaro que sou responsável pela clínica e autorizo o cadastro."
  };
  assert.equal(validarCadastro(cadastroBase).dominioCorporativo, "clinica.exemplo.br");
  assert.throws(() => validarCadastro({
    ...cadastroBase,
    email: "responsavel@gmail.com",
    dominioCorporativo: "gmail.com"
  }), { status: 400 });
  assert.throws(() => validarCadastro({
    ...cadastroBase,
    dominioCorporativo: "outro.exemplo.br"
  }), { status: 400 });
});
