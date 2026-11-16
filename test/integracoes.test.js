const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const variaveisFirebase = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY"
];
const valoresOriginais = Object.fromEntries(
  variaveisFirebase.map(nome => [nome, process.env[nome]])
);
for (const nome of variaveisFirebase) delete process.env[nome];

const {
  normalizarEstabelecimento,
  buscarEstabelecimentoPorCnes,
  buscarEstabelecimentosPorCodigos
} = require("../src/services/cnesService");
const { geocodingEndereco } = require("../src/services/geocodingService");
const { listarEstabelecimentos } = require("../src/controllers/cnesController");
const { buscarCatalogoExames, buscarProducaoSUS } = require("../src/services/examsService");
const { listarProducaoSUS } = require("../src/controllers/examsController");
const { estaNaCaixaDeBusca } = require("../src/services/clinicSearchService");

const buscarOriginal = global.fetch;
after(() => {
  global.fetch = buscarOriginal;
  for (const nome of variaveisFirebase) {
    if (valoresOriginais[nome] === undefined) delete process.env[nome];
    else process.env[nome] = valoresOriginais[nome];
  }
});

function criarResposta() {
  return {
    codigoStatus: null,
    corpo: null,
    status(codigo) {
      this.codigoStatus = codigo;
      return this;
    },
    json(corpo) {
      this.corpo = corpo;
      return this;
    }
  };
}

test("normaliza os campos CNES sem perder código, endereço ou coordenadas", () => {
  const estabelecimento = normalizarEstabelecimento({
    codigo_cnes: 1234567,
    nome_fantasia: "Clínica Central",
    endereco_estabelecimento: "Rua das Flores",
    numero_estabelecimento: "25",
    bairro_estabelecimento: "Centro",
    codigo_municipio: 355030,
    codigo_uf: 35,
    latitude_estabelecimento_decimo_grau: "-23.5",
    longitude_estabelecimento_decimo_grau: "-46.6"
  });

  assert.equal(estabelecimento.codigoCnes, "1234567");
  assert.equal(estabelecimento.nome, "Clínica Central");
  assert.equal(estabelecimento.endereco, "Rua das Flores, 25, Centro");
  assert.equal(estabelecimento.latitude, -23.5);
  assert.equal(estabelecimento.longitude, -46.6);
});

test("aceita sigla de UF e envia o código oficial para a API CNES", async () => {
  let urlConsultada;
  global.fetch = async url => {
    urlConsultada = new URL(url);
    return new Response(JSON.stringify({ estabelecimentos: [] }), { status: 200 });
  };

  const resposta = criarResposta();
  await listarEstabelecimentos(
    { query: { uf: "SP", limit: "1" } },
    resposta,
    erro => { throw erro; }
  );

  assert.equal(resposta.codigoStatus, 200);
  assert.equal(urlConsultada.searchParams.get("codigo_uf"), "35");
});

test("retorna erro claro para sigla de UF inválida", async () => {
  const resposta = criarResposta();
  await listarEstabelecimentos(
    { query: { uf: "XX" } },
    resposta,
    erro => {
      resposta.codigoStatus = erro.status;
      resposta.corpo = { message: erro.message };
    }
  );

  assert.equal(resposta.codigoStatus, 400);
  assert.match(resposta.corpo.message, /sigla de UF válida/i);
});

test("geocodifica um endereço e reaproveita a resposta em cache", async () => {
  let quantidadeChamadas = 0;
  global.fetch = async (_url, opcoes) => {
    quantidadeChamadas += 1;
    assert.match(opcoes.headers["User-Agent"], /ExameJa/);
    return new Response(JSON.stringify([
      { lat: "-23.5", lon: "-46.6", display_name: "Rua das Flores, São Paulo, Brasil" }
    ]), { status: 200 });
  };

  const primeiraResposta = await geocodingEndereco("Rua das Flores, São Paulo");
  const respostaDoCache = await geocodingEndereco("Rua das Flores, São Paulo");

  assert.equal(primeiraResposta.encontrado, true);
  assert.equal(primeiraResposta.latitude, -23.5);
  assert.equal(primeiraResposta.longitude, -46.6);
  assert.deepEqual(respostaDoCache, primeiraResposta);
  assert.equal(quantidadeChamadas, 1);
});

test("informa quando o Nominatim não encontra o endereço", async () => {
  global.fetch = async () => new Response(JSON.stringify([]), { status: 200 });

  const resultado = await geocodingEndereco("Endereço de teste sem resultado 84721");

  assert.equal(resultado.encontrado, false);
  assert.equal(resultado.latitude, null);
  assert.equal(resultado.longitude, null);
  assert.ok(resultado.atribuicao.includes("OpenStreetMap"));
});

test("consulta geocodingEndereco ao detalhar um CNES sem coordenadas", async () => {
  const chamadas = [];
  global.fetch = async url => {
    const enderecoConsultado = String(url);
    chamadas.push(enderecoConsultado);

    if (enderecoConsultado.startsWith("https://apidadosabertos.saude.gov.br/")) {
      return new Response(JSON.stringify({
        codigo_cnes: 7654321,
        nome_fantasia: "Unidade sem coordenadas",
        endereco_estabelecimento: "Rua de Teste",
        numero_estabelecimento: "10",
        bairro_estabelecimento: "Centro",
        municipio: "São Paulo",
        uf: "SP"
      }), { status: 200 });
    }

    return new Response(JSON.stringify([
      { lat: "-23.5", lon: "-46.6", display_name: "Rua de Teste, São Paulo, Brasil" }
    ]), { status: 200 });
  };

  const estabelecimento = await buscarEstabelecimentoPorCnes("7654321");

  assert.equal(estabelecimento.latitude, -23.5);
  assert.equal(estabelecimento.longitude, -46.6);
  assert.equal(chamadas.length, 2);
  assert.ok(chamadas[1].startsWith("https://nominatim.openstreetmap.org/"));
});

test("consulta e normaliza o catálogo TUSS com busca e paginação", async () => {
  let urlConsultada;
  global.fetch = async url => {
    urlConsultada = new URL(url);
    return new Response(JSON.stringify([
      { id: "40304361", display_name: "Hemograma completo", source: "TUSS 22" }
    ]), { status: 200, headers: { "num_found": "1", "pages": "1", "page_number": "2" } });
  };

  const resultado = await buscarCatalogoExames({ termo: "hemograma", pagina: 2, limite: 10 });
  assert.equal(urlConsultada.searchParams.get("q"), "hemograma");
  assert.equal(urlConsultada.searchParams.get("page"), "2");
  assert.equal(urlConsultada.searchParams.get("limit"), "10");
  assert.equal(resultado.dados[0].codigo, "40304361");
  assert.equal(resultado.dados[0].descricao, "Hemograma completo");
  assert.equal(resultado.dados[0].tabela, "TUSS 22");
  assert.equal(resultado.total, 1);
  assert.equal(resultado.paginas, 1);
  assert.equal(resultado.paginaAtual, 2);
});

test("exige período e localidade para consultar produção SUS", async () => {
  const resposta = criarResposta();
  let erroCapturado;
  await listarProducaoSUS(
    { query: {} },
    resposta,
    erro => { erroCapturado = erro; }
  );
  assert.equal(erroCapturado.status, 400);
  assert.match(erroCapturado.message, /ano.*competencia/i);

  erroCapturado = null;
  await listarProducaoSUS(
    { query: { ano: "2025" } },
    resposta,
    erro => { erroCapturado = erro; }
  );
  assert.equal(erroCapturado.status, 400);
  assert.match(erroCapturado.message, /municipio.*cnes/i);
});

test("caixa geográfica elimina pontos distantes e trata longitude circular", () => {
  assert.equal(estaNaCaixaDeBusca(
    { latitude: -23.5, longitude: -46.6 },
    { latitude: -23.51, longitude: -46.61 },
    10
  ), true);
  assert.equal(estaNaCaixaDeBusca(
    { latitude: -23.5, longitude: -46.6 },
    { latitude: -24, longitude: -46.6 },
    10
  ), false);
  assert.equal(estaNaCaixaDeBusca(
    { latitude: 0, longitude: 179.99 },
    { latitude: 0, longitude: -179.99 },
    10
  ), true);
});

test("consulta produção ambulatorial SUS sem apresentar valor como preço particular", async () => {
  let urlConsultada;
  global.fetch = async url => {
    urlConsultada = new URL(url);
    return new Response(JSON.stringify({ dados: [{ procedimento: "Hemograma", valor_aprovado: 5.0 }] }), { status: 200 });
  };

  const resultado = await buscarProducaoSUS({ ano: 2025, municipio: 3550308, cnes: "1234567", limite: 50, deslocamento: 100 });
  assert.equal(urlConsultada.searchParams.get("nu_ano"), "2025");
  assert.equal(urlConsultada.searchParams.get("co_ibge"), "3550308");
  assert.equal(urlConsultada.searchParams.get("co_cnes"), "1234567");
  assert.equal(urlConsultada.searchParams.get("limit"), "50");
  assert.equal(urlConsultada.searchParams.get("offset"), "100");
  assert.match(resultado.naturezaDosValores, /não são preços de clínicas particulares/i);
  assert.match(resultado.dados[0].naturezaDosValores, /valores aprovados pelo SUS/i);
});

test("enriquece produção SUS com o estabelecimento correspondente do CNES", async () => {
  const chamadas = [];
  global.fetch = async url => {
    const endereco = String(url);
    chamadas.push(endereco);
    if (endereco.includes("sia-procedimentos-ambulatoriais")) {
      return new Response(JSON.stringify({ dados: [{ co_cnes: "7654322", procedimento: "Exame SUS" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      codigo_cnes: 7654322,
      nome_fantasia: "Laboratório Público",
      endereco_estabelecimento: "Rua da Saúde",
      municipio: "São Paulo",
      uf: "SP"
    }), { status: 200 });
  };

  const resultado = await buscarProducaoSUS({ ano: 2025, municipio: 3550308, limite: 1 });

  assert.equal(chamadas.length, 2);
  assert.equal(resultado.dados[0].estabelecimento.nome, "Laboratório Público");
  assert.equal(resultado.dados[0].estabelecimento.codigoCnes, "7654322");
  assert.equal(resultado.estabelecimentos.length, 1);
});

test("reaproveita o estabelecimento CNES em consultas repetidas", async () => {
  let chamadasCnes = 0;
  global.fetch = async () => {
    chamadasCnes += 1;
    return new Response(JSON.stringify({
      codigo_cnes: 7654323,
      nome_fantasia: "Estabelecimento em cache"
    }), { status: 200 });
  };

  const primeira = await buscarEstabelecimentosPorCodigos(["7654323"]);
  const segunda = await buscarEstabelecimentosPorCodigos(["7654323"]);

  assert.equal(chamadasCnes, 1);
  assert.equal(primeira[0].estabelecimento.nome, "Estabelecimento em cache");
  assert.equal(segunda[0].estabelecimento.nome, "Estabelecimento em cache");
});
