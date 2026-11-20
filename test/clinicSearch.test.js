const { test } = require("node:test");
const assert = require("node:assert/strict");

const examesService = require("../src/services/examsService");
const conveniosRepository = require("../src/repositories/conveniosRepository");
const ofertasRepository = require("../src/repositories/examOffersRepository");

let ofertas = [];
let clinicas = [];

examesService.buscarExamePorCodigo = async codigo => ({
  codigo,
  nome: "Exame de teste",
  tabela: "TUSS"
});
conveniosRepository.listarAtivos = async () => [{ id: "amil", nome: "Amil", ativo: true }];
ofertasRepository.listarOfertasPorCodigos = async codigos => ofertas
  .filter(oferta => codigos.includes(oferta.codigoExame) && oferta.ativa === true);
ofertasRepository.buscarClinicasPorIds = async ids => clinicas.filter(clinica =>
  ids.includes(clinica.uid) && clinica.tipo === "clinica" && clinica.status === "aprovada"
);

const { buscarClinicas } = require("../src/services/clinicSearchService");

test("busca somente ofertas aprovadas que atendem localização, convênio e preço", async () => {
  ofertas = [
    { uidClinica: "perto", codigoExame: "T1", preco: 60, ativa: true },
    { uidClinica: "longe", codigoExame: "T1", preco: 15, ativa: true },
    { uidClinica: "outro-convenio", codigoExame: "T1", preco: 50, ativa: true },
    { uidClinica: "sem-coordenadas", codigoExame: "T1", preco: 70, ativa: true },
    { uidClinica: "preco-alto", codigoExame: "T1", preco: 140, ativa: true },
    { uidClinica: "inativa", codigoExame: "T1", preco: 20, ativa: false },
    { uidClinica: "outro-exame", codigoExame: "T2", preco: 10, ativa: true }
  ];
  clinicas = [
    {
      uid: "perto", tipo: "clinica", status: "aprovada", nomeFantasia: "Clínica próxima",
      endereco: "Rua A", enderecoCoordenadas: "Rua A", latitude: -23.51, longitude: -46.61,
      conveniosAceitos: ["amil"]
    },
    {
      uid: "longe", tipo: "clinica", status: "aprovada", endereco: "Rua B",
      enderecoCoordenadas: "Rua B", latitude: -23.9, longitude: -46.6, conveniosAceitos: ["amil"]
    },
    {
      uid: "outro-convenio", tipo: "clinica", status: "aprovada", endereco: "Rua C",
      enderecoCoordenadas: "Rua C", latitude: -23.51, longitude: -46.61, conveniosAceitos: []
    },
    {
      uid: "sem-coordenadas", tipo: "clinica", status: "aprovada", endereco: "Rua D",
      conveniosAceitos: ["amil"]
    },
    {
      uid: "preco-alto", tipo: "clinica", status: "aprovada", endereco: "Rua E",
      enderecoCoordenadas: "Rua E", latitude: -23.51, longitude: -46.61, conveniosAceitos: ["amil"]
    },
    {
      uid: "pendente", tipo: "clinica", status: "pendente", endereco: "Rua F",
      enderecoCoordenadas: "Rua F", latitude: -23.51, longitude: -46.61, conveniosAceitos: ["amil"]
    }
  ];

  const resultado = await buscarClinicas({
    codigoExame: "T1",
    latitude: -23.5,
    longitude: -46.6,
    raioKm: 10,
    convenioId: "amil",
    precoMinimo: 40,
    precoMaximo: 100,
    ordenar: "preco",
    limite: 20,
    deslocamento: 0
  });

  assert.equal(resultado.total, 1);
  assert.equal(resultado.resultados[0].clinica.uid, "perto");
  assert.equal(resultado.resultados[0].exame.nome, "Exame de teste");
  assert.equal(resultado.resultados[0].preco.valor, 60);
  assert.equal(resultado.clinicasSemCoordenadas, 1);
});

test("aplica paginação depois de ordenar os resultados", async () => {
  ofertas = [
    { uidClinica: "a", codigoExame: "T1", preco: 80, ativa: true },
    { uidClinica: "b", codigoExame: "T1", preco: 40, ativa: true }
  ];
  clinicas = ["a", "b"].map(uid => ({
    uid, tipo: "clinica", status: "aprovada", endereco: `Rua ${uid}`,
    enderecoCoordenadas: `Rua ${uid}`, latitude: -23.51, longitude: -46.61,
    conveniosAceitos: []
  }));

  const resultado = await buscarClinicas({
    codigoExame: "T1", latitude: -23.5, longitude: -46.6,
    raioKm: 10, ordenar: "preco", limite: 1, deslocamento: 1
  });

  assert.equal(resultado.total, 2);
  assert.equal(resultado.resultados.length, 1);
  assert.equal(resultado.resultados[0].clinica.uid, "a");
});
