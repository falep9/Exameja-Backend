const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const usersRepository = require("../src/repositories/usersRepository");
const conveniosRepository = require("../src/repositories/conveniosRepository");

const listarClinicasOriginal = usersRepository.listarClinicasAprovadas;
const listarAtivosOriginal = conveniosRepository.listarAtivos;

const clinicaEmBelem = {
  uid: "belem", tipo: "clinica", status: "aprovada", nomeFantasia: "Clínica Nazaré",
  endereco: "Av. Nazaré, 500", enderecoCoordenadas: "Av. Nazaré, 500", latitude: -1.4521, longitude: -48.4848,
  telefone: "91999990000", email: "privado@exemplo.com", cnpj: "11222333000181", conveniosAceitos: ["amil", "inativo"]
};
const clinicaEmAnanindeua = { ...clinicaEmBelem, uid: "ananindeua", nomeFantasia: "Clínica BR", endereco: "BR-316, km 8", enderecoCoordenadas: "BR-316, km 8", latitude: -1.3656, longitude: -48.3722, conveniosAceitos: ["cassi"] };
const clinicaEmSaoPaulo = { ...clinicaEmBelem, uid: "sp", endereco: "Av. Paulista, 1", enderecoCoordenadas: "Av. Paulista, 1", latitude: -23.56, longitude: -46.65 };
const clinicaSemCoordenadas = { ...clinicaEmBelem, uid: "sem", endereco: "Rua nova", enderecoCoordenadas: "Rua antiga" };

usersRepository.listarClinicasAprovadas = async () => [clinicaEmAnanindeua, clinicaEmSaoPaulo, clinicaSemCoordenadas, clinicaEmBelem];
conveniosRepository.listarAtivos = async () => [
  { id: "amil", nome: "Amil", ativo: true },
  { id: "cassi", nome: "Cassi", ativo: true },
  { id: "inativo", nome: "Inativo", ativo: false }
];

const { listar } = require("../src/controllers/clinicMapController");

after(() => {
  usersRepository.listarClinicasAprovadas = listarClinicasOriginal;
  conveniosRepository.listarAtivos = listarAtivosOriginal;
});

function criarResposta() {
  return {
    statusCodigo: null,
    corpo: null,
    status(codigo) { this.statusCodigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

async function chamar(query) {
  const resposta = criarResposta();
  let erro;
  await listar({ query }, resposta, recebido => { erro = recebido; });
  return { resposta, erro };
}

test("sem parâmetros, lista as clínicas a até 30 km de Belém, mais perto primeiro, só com dados públicos", async () => {
  const { resposta, erro } = await chamar({});
  assert.equal(erro, undefined);
  assert.equal(resposta.statusCodigo, 200);
  assert.deepEqual(resposta.corpo.centro, { latitude: -1.4558, longitude: -48.4902, nome: "Belém, PA" });
  assert.equal(resposta.corpo.raioKm, 30);
  assert.deepEqual(resposta.corpo.clinicas.map(clinica => clinica.uid), ["belem", "ananindeua"]);
  assert.equal(resposta.corpo.clinicasSemCoordenadas, 1);
  const [primeira] = resposta.corpo.clinicas;
  assert.deepEqual(primeira.conveniosAceitos, [{ id: "amil", nome: "Amil" }]);
  assert.equal(primeira.email, undefined);
  assert.equal(primeira.cnpj, undefined);
  assert.ok(primeira.distanciaKm < 1);
});

test("filtra pelo convênio e pelo raio informado", async () => {
  const porConvenio = await chamar({ convenioId: "cassi" });
  assert.deepEqual(porConvenio.resposta.corpo.clinicas.map(clinica => clinica.uid), ["ananindeua"]);
  const raioCurto = await chamar({ raioKm: "5" });
  assert.deepEqual(raioCurto.resposta.corpo.clinicas.map(clinica => clinica.uid), ["belem"]);
});

test("recusa parâmetros desconhecidos, coordenada pela metade e raio fora do limite", async () => {
  for (const query of [{ codigoExame: "1" }, { latitude: "-1.4" }, { raioKm: "80" }, { convenioId: "Amil Saúde" }]) {
    const { erro } = await chamar(query);
    assert.equal(erro?.status, 400, JSON.stringify(query));
  }
});
