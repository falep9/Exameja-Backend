const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");

const firebaseConfig = require("../src/config/firebase");
const usersRepository = require("../src/repositories/usersRepository");
const appointmentsRepository = require("../src/repositories/appointmentsRepository");
const conveniosRepository = require("../src/repositories/conveniosRepository");
const ofertasRepository = require("../src/repositories/examOffersRepository");
const { COOKIE_SESSAO, COOKIE_CSRF } = require("../src/utils/sessionCookies");

const obterAutenticacaoOriginal = firebaseConfig.obterAutenticacaoFirebase;
const buscarPerfilOriginal = usersRepository.buscarPerfil;
const listarAgendamentosOriginal = appointmentsRepository.listarAgendamentos;
const criarAgendamentoOriginal = appointmentsRepository.criarAgendamento;
const buscarConveniosOriginal = conveniosRepository.buscarPorIds;
const listarOfertasClinicaOriginal = ofertasRepository.listarOfertasClinica;

let servidor;
let baseUrl;
let criado;

firebaseConfig.obterAutenticacaoFirebase = () => ({
  verifySessionCookie: async token => token === "sessao-teste"
    ? { uid: "cliente-teste", email: "cliente@example.com", email_verified: true }
    : Promise.reject(Object.assign(new Error("Sessão inválida"), { code: "auth/invalid-session-cookie" }))
});
usersRepository.buscarPerfil = async uid => uid === "clinica-teste"
  ? {
    uid, tipo: "clinica", status: "aprovada", nomeFantasia: "Clínica Teste",
    endereco: "Rua A, 10", telefone: "1133334444", enderecoCoordenadas: "Rua A, 10",
    latitude: -23.5, longitude: -46.6, conveniosAceitos: ["amil"]
  }
  : uid === "cliente-teste"
    ? { uid, tipo: "cliente", status: "ativo" }
    : null;
appointmentsRepository.listarAgendamentos = async () => ({ agendamentos: [], proximoCursor: null });
appointmentsRepository.criarAgendamento = async dados => {
  criado = dados;
  return { id: "agendamento-teste", ...dados, status: "pendente" };
};
conveniosRepository.buscarPorIds = async () => [{ id: "amil", nome: "Amil", ativo: true }];
ofertasRepository.listarOfertasClinica = async () => [{
  codigoExame: "123", nomeExame: "Hemograma", preco: 75, moeda: "BRL", ativa: true
}];

const carregarModuloOriginal = Module._load;
Module._load = function carregarComSocketFalso(nome, pai, principal) {
  if (nome === "socket.io") return { Server: class ServidorSocketSemUso {} };
  return carregarModuloOriginal.call(this, nome, pai, principal);
};
const aplicacao = require("../src/app");
Module._load = carregarModuloOriginal;

before(async () => {
  servidor = http.createServer(aplicacao);
  await new Promise(resolve => servidor.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
  firebaseConfig.obterAutenticacaoFirebase = obterAutenticacaoOriginal;
  usersRepository.buscarPerfil = buscarPerfilOriginal;
  appointmentsRepository.listarAgendamentos = listarAgendamentosOriginal;
  appointmentsRepository.criarAgendamento = criarAgendamentoOriginal;
  conveniosRepository.buscarPorIds = buscarConveniosOriginal;
  ofertasRepository.listarOfertasClinica = listarOfertasClinicaOriginal;
});

test("monta /api/appointments e protege leitura por cookie de sessão", async () => {
  const semSessao = await fetch(`${baseUrl}/api/appointments`);
  assert.equal(semSessao.status, 401);

  const autenticada = await fetch(`${baseUrl}/api/appointments`, {
    headers: { Cookie: `${COOKIE_SESSAO}=sessao-teste` }
  });
  assert.equal(autenticada.status, 200);
  assert.deepEqual(await autenticada.json(), { agendamentos: [], proximoCursor: null });
});

test("publica detalhes da clínica sem exigir sessão", async () => {
  const resposta = await fetch(`${baseUrl}/api/clinics/clinica-teste`);
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), {
    clinica: {
      uid: "clinica-teste",
      nomeFantasia: "Clínica Teste",
      endereco: "Rua A, 10",
      telefone: "1133334444",
      avaliacaoMedia: 0,
      quantidadeAvaliacoes: 0,
      latitude: -23.5,
      longitude: -46.6,
      conveniosAceitos: [{ id: "amil", nome: "Amil" }],
      ofertas: [{ codigoExame: "123", nomeExame: "Hemograma", preco: 75, moeda: "BRL" }]
    }
  });
});

test("cria agendamento com cookie e CSRF e bloqueia POST sem CSRF", async () => {
  const corpo = {
    clinicaUid: "clinica-teste",
    codigoExame: "123",
    dataHora: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
  const cookie = `${COOKIE_SESSAO}=sessao-teste; ${COOKIE_CSRF}=csrf-teste`;

  const semCsrf = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });
  assert.equal(semCsrf.status, 403);

  const resposta = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": "csrf-teste",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(corpo)
  });
  assert.equal(resposta.status, 201);
  const agendamento = await resposta.json();
  assert.equal(agendamento.id, "agendamento-teste");
  assert.equal(agendamento.status, "pendente");
  assert.equal(criado.clienteUid, "cliente-teste");
  assert.equal(criado.clinicaUid, "clinica-teste");
  assert.equal(criado.nomeExame, "Hemograma");
});
