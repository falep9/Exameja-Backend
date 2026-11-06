const URL_TUSS = process.env.ANS_TUSS_API_URL
  || "https://consulta-ocl.apps.sa-1a.mendixcloud.com/rest/oclservice/ANS/concepts/tuss-43";
const URL_API_SUS = process.env.MINISTERIO_SAUDE_API_URL || "https://apidadosabertos.saude.gov.br";
const DURACAO_CACHE_TUSS_MS = 6 * 60 * 60 * 1000;
const MAXIMO_ITENS_CACHE_TUSS = 250;
const cacheTuss = new Map();
const { getJson, getJsonResponse, ErroApiExterna } = require("../utils/externalApi");
const consultasTussEmAndamento = new Map();
const { buscarEstabelecimentosPorCodigos } = require("./cnesService");

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
    origem: "ANS - Terminologia Unificada da Saúde Suplementar"
  };
}

async function buscarCatalogoExames({ termo, pagina = 1, limite = 20 }) {
  const url = new URL(URL_TUSS);
  url.searchParams.set("page", String(pagina));
  url.searchParams.set("limit", String(limite));
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
    const resposta = await getJsonResponse(url, { service: "a API de terminologias da ANS" });
    const bruto = resposta.data;
    const conceitos = extrairLista(bruto, "A API de terminologias da ANS");
    const dados = conceitos.map(normalizarConceito).filter(item => item.codigo && item.descricao);
    const resultado = {
      origem: "ANS - TUSS",
      dados,
      pagina,
      limit: limite,
      total: bruto.total ?? bruto.total_count ?? bruto.totalElements
        ?? (Number(resposta.headers.get("num_found")) || null),
      paginas: Number(resposta.headers.get("pages")) || null,
      paginaAtual: Number(resposta.headers.get("page_number")) || pagina,
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

function codigoCnesDoRegistro(registro) {
  const valor = registro.co_cnes ?? registro.codigo_cnes ?? registro.codigoCnes ?? registro.cnes;
  return valor === undefined || valor === null ? null : String(valor);
}

async function buscarExamesIntegrado({ termo, pagina = 1, limite = 20, ano, competencia, municipio, cnes, offset = 0 }) {
  const possuiFiltroSUS = Boolean(ano || competencia || municipio || cnes);
  if (!possuiFiltroSUS) {
    return {
      termo,
      catalogo: await buscarCatalogoExames({ termo, pagina, limite }),
      producaoSus: null,
      estabelecimentos: [],
      observacao: "Informe ano ou competência e município ou CNES para consultar produção SUS. A TUSS não é vinculada automaticamente aos códigos SIGTAP."
    };
  }

  if (limite > 20) {
    const erro = new Error("A busca integrada aceita no máximo 20 resultados por página para limitar consultas CNES.");
    erro.status = 400;
    throw erro;
  }

  if ((!ano && !competencia) || (!municipio && !cnes)) {
    const erro = new Error("Para incluir produção SUS, informe ano ou competência e também município ou CNES.");
    erro.status = 400;
    throw erro;
  }

  const [catalogo, producaoSus] = await Promise.all([
    buscarCatalogoExames({ termo, pagina, limite }),
    buscarProducaoSUS({ ano, competencia, municipio, cnes, limite, deslocamento: offset })
  ]);

  const codigosCnes = producaoSus.dados.map(codigoCnesDoRegistro).filter(Boolean);
  const estabelecimentos = await buscarEstabelecimentosPorCodigos(codigosCnes);
  const estabelecimentosPorCodigo = new Map(estabelecimentos.map(item => [item.codigoCnes, item.estabelecimento]));
  const producaoComEstabelecimentos = producaoSus.dados.map(registro => {
    const codigo = codigoCnesDoRegistro(registro);
    return {
      ...registro,
      estabelecimento: codigo ? estabelecimentosPorCodigo.get(codigo) || null : null
    };
  });

  return {
    termo,
    catalogo,
    producaoSus: { ...producaoSus, dados: producaoComEstabelecimentos },
    estabelecimentos,
    relacionamentoTussSus: "Não há correspondência automática entre código TUSS e procedimento SIA/SUS; os conjuntos são apresentados separadamente."
  };
}

module.exports = { buscarCatalogoExames, buscarProducaoSUS, buscarExamesIntegrado, ErroApiExterna };
