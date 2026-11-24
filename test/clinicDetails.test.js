const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const usersRepository = require("../src/repositories/usersRepository");
const conveniosRepository = require("../src/repositories/conveniosRepository");
const ofertasRepository = require("../src/repositories/examOffersRepository");

const buscarPerfilOriginal = usersRepository.buscarPerfil;
const buscarPorIdsOriginal = conveniosRepository.buscarPorIds;
const listarOfertasOriginal = ofertasRepository.listarOfertasClinica;

let perfil;
usersRepository.buscarPerfil = async () => perfil;
conveniosRepository.buscarPorIds = async () => [
  { id: "amil", nome: "Amil", ativo: true },
  { id: "inativo", nome: "Convênio inativo", ativo: false }
];
ofertasRepository.listarOfertasClinica = async () => [{
  uidClinica: "clinica-teste",
  codigoExame: "123",
  nomeExame: "Hemograma",
  preco: 75,
  moeda: "BRL",
  ativo: true
}];

const { obterDetalhes } = require("../src/controllers/clinicDetailsController");

after(() => {
  usersRepository.buscarPerfil = buscarPerfilOriginal;
  conveniosRepository.buscarPorIds = buscarPorIdsOriginal;
  ofertasRepository.listarOfertasClinica = listarOfertasOriginal;
});

function criarResposta() {
  return {
    statusCodigo: null,
    corpo: null,
    headers: {},
    status(codigo) { this.statusCodigo = codigo; return this; },
    set(nome, valor) { this.headers[nome] = valor; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

test("retorna somente informações públicas da clínica aprovada e suas ofertas", async () => {
  perfil = {
    uid: "clinica-teste",
    tipo: "clinica",
    status: "aprovada",
    nomeFantasia: "Clínica Central",
    endereco: "Rua A, 10",
    enderecoCoordenadas: "Rua antiga",
    latitude: -23.5,
    longitude: -46.6,
    telefone: "1133334444",
    email: "privado@example.com",
    cnpj: "11222333000181",
    conveniosAceitos: ["amil", "inativo"]
  };
  const resposta = criarResposta();
  let erro;

  await obterDetalhes({ params: { uid: "clinica-teste" } }, resposta, recebido => { erro = recebido; });

  assert.equal(erro, undefined);
  assert.equal(resposta.statusCodigo, 200);
  assert.equal(resposta.headers["Cache-Control"], "no-store");
  assert.deepEqual(resposta.corpo, {
    clinica: {
      uid: "clinica-teste",
      nomeFantasia: "Clínica Central",
      endereco: "Rua A, 10",
      telefone: "1133334444",
      avaliacaoMedia: 0,
      quantidadeAvaliacoes: 0,
      conveniosAceitos: [{ id: "amil", nome: "Amil" }],
      ofertas: [{ codigoExame: "123", nomeExame: "Hemograma", preco: 75, moeda: "BRL" }]
    }
  });
});

test("não revela perfis de clínica que não estejam aprovados", async () => {
  perfil = { uid: "clinica-teste", tipo: "clinica", status: "pendente" };
  const resposta = criarResposta();

  await obterDetalhes({ params: { uid: "clinica-teste" } }, resposta, assert.fail);

  assert.equal(resposta.statusCodigo, 404);
  assert.deepEqual(resposta.corpo, { message: "Clínica não encontrada." });
});
