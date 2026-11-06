const URL_TUSS = process.env.ANS_TUSS_API_URL
  || "https://consulta-ocl.apps.sa-1a.mendixcloud.com/rest/oclservice/ANS/concepts/tuss-43";
const URL_API_SUS = process.env.MINISTERIO_SAUDE_API_URL || "https://apidadosabertos.saude.gov.br";
const DURACAO_CACHE_TUSS_MS = 6 * 60 * 60 * 1000;
const MAXIMO_ITENS_CACHE_TUSS = 250;
const cacheTuss = new Map();
const { getJson, ErroApiExterna } = require("../utils/externalApi");
const consultasTussEmAndamento = new Map();

function extrairLista(dados, servico) {
  if (Array.isArray(dados)) return validarRegistros(dados, servico);
  for (const chave of ["results", "concepts", "items", "data", "dados"]) {
    if (Array.isArray(dados?.[chave])) return validarRegistros(dados[chave], servico);
  }
  throw new ErroApiExterna(`${servico} retornou dados em formato inesperado.`);
}

function validarRegistros(registros, servico) {
  if (registros.some(registro => !registro || typeof registro !== "object" || Array.isArray(registro))) {
    throw new ErroApiExterna(`${servico} retornou registros em formato inválido.`);
  }
  return registros;
}

function normalizarConceito(conceito) {
  if (!conceito || typeof conceito !== "object") {
    throw new ErroApiExterna("A API da ANS retornou um conceito inválido.");
  }
  return {
    codigo: conceito.concept_code ?? conceito.concept?.id ?? conceito.id ?? conceito.code ?? conceito.codigo ?? null,
    descricao: conceito.display_name ?? conceito.concept?.name ?? conceito.fully_specified_name
      ?? conceito.name ?? conceito.concept_name ?? conceito.descricao ?? conceito.display ?? null,
    tabela: conceito.source || conceito.source_name || conceito.extras?.source || "TUSS",
    origem: "ANs"
  };
}

async function buscarCatalogoExames({ termo, pagina = 1, limite = 20 }) {
  const url = new URL(URL_TUSS);
  url.searchParams.set("page", String(pagina));
  url.searchParams.set("page_size", String(limite));
  if (termo) url.searchParams.set("q", termo);
  const chaveCache = url.toString();
  const itemCache = cacheTuss.get(chaveCache);
  if (itemCache && itemCache.expiraEm > Date.now()) {
    cacheTuss.delete(chaveCache);
    cacheTuss.set(chaveCache, itemCache);
    return itemCache.resultado;
  }
  if (itemCache) cacheTuss.delete(chaveCache);
  if (consultasTussEmAndamento.has(chaveCache)) return consultasTussEmAndamento.get(chaveCache);

  const consulta = (async () => {
    const bruto = await getJson(url, { service: "a API de terminologias da ANS" });
    const conceitos = extrairLista(bruto, "A API de terminologias da ANS");
    const dados = conceitos.map(normalizarConceito).filter(item => item.codigo && item.descricao);
    const resultado = {
      origem: "ANS - TUSS",
      dados,
      pagina,
      limit: limite,
      total: bruto.total ?? bruto.total_count ?? bruto.totalElements ?? null,
      consultadoEm: new Date().toISOString()
    };
    cacheTuss.set(chaveCache, { resultado, expiraEm: Date.now() + DURACAO_CACHE_TUSS_MS });
    if (cacheTuss.size > MAXIMO_ITENS_CACHE_TUSS) cacheTuss.delete(cacheTuss.keys().next().value);
    return resultado;
  })();
  consultasTussEmAndamento.set(chaveCache, consulta);
  try {
    return await consulta;
  } finally {
    consultasTussEmAndamento.delete(chaveCache);
  }
}

async function buscarProducaoSUS({ ano, competencia, municipio, cnes, limite = 100, deslocamento = 0 }) {
  const url = new URL("/assistencia-a-saude/sia-procedimentos-ambulatoriais", URL_API_SUS);
  if (ano) url.searchParams.set("nu_ano", String(ano));
  if (competencia) url.searchParams.set("nu_comp", String(competencia));
  if (municipio) url.searchParams.set("co_ibge", String(municipio));
  if (cnes) url.searchParams.set("co_cnes", cnes);
  url.searchParams.set("limit", String(limite));
  url.searchParams.set("offset", String(deslocamento));
  const bruto = await getJson(url, { service: "a API de Dados Abertos do Ministério da Saúde" });
  const registros = extrairLista(bruto, "A API de Dados Abertos do Ministério da Saúde");
  return {
    origem: "Ministério da Saúde - SIA/SUS",
    naturezaDosValores: "Valores aprovados pelo SUS; não são preços de clínicas particulares.",
    consultadoEm: new Date().toISOString(),
    dados: registros.map(registro => ({
      ...registro,
      origem: "Ministério da Saúde - SIA/SUS",
      naturezaDosValores: "Valores aprovados pelo SUS; não são preços de clínicas particulares."
    })),
    limit: limite,
    offset: deslocamento,
    total: bruto.total ?? bruto.total_count ?? bruto.count ?? null
  };
}

module.exports = { buscarCatalogoExames, buscarProducaoSUS, ErroApiExterna };
