const API_CNES = "https://apidadosabertos.saude.gov.br";
const { obterBancoFirestore, firebaseEstaConfigurado } = require("../config/firebase");
const { geocodingEndereco } = require("./geocodingService");
const { getJson, ErroApiExterna } = require("../utils/externalApi");

const DURACAO_CACHE_CNES_MS = 24 * 60 * 60 * 1000;
const MAXIMO_ITENS_CACHE_CNES_MEMORIA = 1000;
const cacheCnesMemoria = new Map();

function salvarCacheCnesMemoria(estabelecimento, atualizadoEm = Date.now()) {
  if (!estabelecimento?.codigoCnes) return;
  cacheCnesMemoria.delete(estabelecimento.codigoCnes);
  cacheCnesMemoria.set(estabelecimento.codigoCnes, { estabelecimento, atualizadoEm });
  if (cacheCnesMemoria.size > MAXIMO_ITENS_CACHE_CNES_MEMORIA) {
    cacheCnesMemoria.delete(cacheCnesMemoria.keys().next().value);
  }
}

async function consultarCacheCnes(codigos) {
  const encontrados = new Map();
  const ausentes = [];
  for (const codigo of codigos) {
    const item = cacheCnesMemoria.get(codigo);
    if (item) {
      encontrados.set(codigo, item);
      cacheCnesMemoria.delete(codigo);
      cacheCnesMemoria.set(codigo, item);
    } else {
      ausentes.push(codigo);
    }
  }

  if (ausentes.length && firebaseEstaConfigurado()) {
    try {
      const banco = obterBancoFirestore();
      const documentos = await banco.getAll(...ausentes.map(codigo => banco.collection("estabelecimentos").doc(codigo)));
      for (const documento of documentos) {
        if (!documento.exists) continue;
        const dados = documento.data();
        const atualizadoEm = Date.parse(dados.ultimaAtualizacao);
        if (!Number.isFinite(atualizadoEm)) continue;
        const item = {
          estabelecimento: { ...normalizarEstabelecimento(dados), codigoCnes: String(dados.codigoCnes || documento.id) },
          atualizadoEm
        };
        salvarCacheCnesMemoria(item.estabelecimento, atualizadoEm);
        encontrados.set(documento.id, item);
      }
    } catch (erro) {
      console.warn("Não foi possível consultar o cache CNES do Firestore:", erro.message);
    }
  }
  return encontrados;
}

function extrairEstabelecimentos(dados) {
  if (Array.isArray(dados)) return dados;
  for (const chave of ["estabelecimentos", "dados", "results", "data", "items"]) {
    if (Array.isArray(dados?.[chave])) return dados[chave];
  }
  if (dados && typeof dados === "object"
    && ["codigo_cnes", "codigo_unidade", "cnes", "nome_fantasia", "nome_estabelecimento"]
      .some(chave => dados[chave] !== undefined)) return [dados];
  throw new ErroApiExterna("A API CNES retornou dados em um formato inesperado.");
}

function obterPrimeiroCampo(registro, nomesCampos) {
  for (const nomeCampo of nomesCampos) {
    if (registro[nomeCampo] !== undefined && registro[nomeCampo] !== null && registro[nomeCampo] !== "") {
      return registro[nomeCampo];
    }
  }
  return null;
}

function obterCoordenada(registro, nomesCampos) {
  const valor = obterPrimeiroCampo(registro, nomesCampos);
  if (valor === null) return null;
  const numero = Number(valor);
  const limite = nomesCampos.some(nome => nome.toLowerCase().includes("latitude")) ? 90 : 180;
  return Number.isFinite(numero) && Math.abs(numero) <= limite ? numero : null;
}

function normalizarEstabelecimento(registro) {
  const codigoCnes = obterPrimeiroCampo(registro, ["codigo_cnes", "codigoCnes", "codigo_unidade", "cnes"]);
  const nome = obterPrimeiroCampo(registro, ["nome_fantasia", "nomeFantasia", "nome_estabelecimento", "nome"])
    || obterPrimeiroCampo(registro, ["nome_razao_social"])
    || null;
  const logradouro = obterPrimeiroCampo(registro, ["logradouro", "endereco_estabelecimento", "descricao_logradouro"]);
  const numero = obterPrimeiroCampo(registro, ["numero", "numero_endereco", "numero_estabelecimento"]);
  const complemento = obterPrimeiroCampo(registro, ["complemento", "complemento_endereco"]);
  const bairro = obterPrimeiroCampo(registro, ["bairro", "bairro_estabelecimento"]);
  const endereco = [logradouro, numero, complemento, bairro].filter(Boolean).join(", ")
    || obterPrimeiroCampo(registro, ["endereco"]);

  return {
    codigoCnes: codigoCnes === null ? null : String(codigoCnes),
    nome,
    endereco,
    municipio: obterPrimeiroCampo(registro, ["nome_municipio", "municipio", "descricao_municipio"]),
    codigoMunicipio: obterPrimeiroCampo(registro, ["codigo_municipio", "codigoMunicipio"]),
    uf: obterPrimeiroCampo(registro, ["uf", "sigla_uf", "uf_sigla"]),
    codigoUf: obterPrimeiroCampo(registro, ["codigo_uf", "codigoUf"]),
    cep: obterPrimeiroCampo(registro, ["codigo_cep", "cep", "codigo_cep_estabelecimento"]),
    telefone: obterPrimeiroCampo(registro, ["numero_telefone", "telefone", "numero_telefone_estabelecimento"]),
    latitude: obterCoordenada(registro, ["latitude_estabelecimento_decimo_grau", "latitude"]),
    longitude: obterCoordenada(registro, ["longitude_estabelecimento_decimo_grau", "longitude"]),
    origem: "CNES - Dados Abertos do Ministério da Saúde"
  };
}

async function salvarEstabelecimentos(estabelecimentos) {
  for (const estabelecimento of estabelecimentos) salvarCacheCnesMemoria(estabelecimento);
  if (!firebaseEstaConfigurado()) return;

  let banco;
  try {
    banco = obterBancoFirestore();
  } catch (erro) {
    console.warn("O Firestore está indisponível; os dados serão retornados sem serem salvos:", erro.message);
    return;
  }

  try {
    for (const estabelecimento of estabelecimentos) {
      if (!estabelecimento.codigoCnes) continue;
      await banco.collection("estabelecimentos").doc(estabelecimento.codigoCnes).set({
        ...estabelecimento,
        ultimaAtualizacao: new Date().toISOString()
      }, { merge: true });
    }
  } catch (erro) {
    console.warn("Não foi possível salvar os estabelecimentos no Firestore; os dados serão retornados mesmo assim:", erro.message);
  }
}

async function buscarEstabelecimentos({ codigoMunicipio, codigoUf, limite = 20, deslocamento = 0 }) {
  const parametros = new URLSearchParams();
  if (codigoMunicipio) parametros.set("codigo_municipio", String(codigoMunicipio));
  if (codigoUf) parametros.set("codigo_uf", String(codigoUf));
  parametros.set("status", "1");
  parametros.set("limit", String(Math.min(limite, 20)));
  parametros.set("offset", String(deslocamento));

  const resposta = await getJson(
    `${API_CNES}/cnes/estabelecimentos?${parametros}`,
    { service: "a API CNES" }
  );
  const estabelecimentos = extrairEstabelecimentos(resposta).map(normalizarEstabelecimento);
  await salvarEstabelecimentos(estabelecimentos);

  return { dados: estabelecimentos, limit: Math.min(limite, 20), offset: deslocamento };
}

async function buscarEstabelecimentoPorCnes(codigoCnes) {
  const resposta = await getJson(
    `${API_CNES}/cnes/estabelecimentos/${encodeURIComponent(codigoCnes)}`,
    { service: "a API CNES" }
  );
  const [registro] = extrairEstabelecimentos(resposta);
  const estabelecimento = normalizarEstabelecimento(registro);

  const enderecoParaBusca = [
    estabelecimento.endereco,
    estabelecimento.municipio,
    estabelecimento.uf,
    estabelecimento.cep,
    "Brasil"
  ].filter(Boolean).join(", ");

  const possuiCoordenadas = Number.isFinite(estabelecimento.latitude)
    && Number.isFinite(estabelecimento.longitude);
  if (!possuiCoordenadas && estabelecimento.endereco && (estabelecimento.municipio || estabelecimento.uf)) {
    const resultadoGeocodificacao = await geocodingEndereco(enderecoParaBusca);
    if (resultadoGeocodificacao.encontrado) {
      estabelecimento.latitude = resultadoGeocodificacao.latitude;
      estabelecimento.longitude = resultadoGeocodificacao.longitude;
    }
    estabelecimento.geocodificacao = resultadoGeocodificacao;
  }

  await salvarEstabelecimentos([estabelecimento]);
  return estabelecimento;
}

async function buscarEstabelecimentosPorCodigos(codigosCnes, { concorrencia = 4 } = {}) {
  const codigosUnicos = [...new Set(codigosCnes.filter(codigo => /^\d{1,10}$/.test(String(codigo))))];
  const cache = await consultarCacheCnes(codigosUnicos);
  const expiracao = Date.now() - DURACAO_CACHE_CNES_MS;
  const paraConsultar = codigosUnicos.filter(codigo => !cache.has(codigo) || cache.get(codigo).atualizadoEm < expiracao);
  const atualizados = new Map();
  for (let indice = 0; indice < paraConsultar.length; indice += concorrencia) {
    const grupo = paraConsultar.slice(indice, indice + concorrencia);
    const respostas = await Promise.allSettled(grupo.map(async codigo => {
      const bruto = await getJson(
        `${API_CNES}/cnes/estabelecimentos/${encodeURIComponent(codigo)}`,
        { service: "a API CNES" }
      );
      const [registro] = extrairEstabelecimentos(bruto);
      const estabelecimento = normalizarEstabelecimento(registro);
      return { ...estabelecimento, codigoCnes: estabelecimento.codigoCnes || codigo };
    }));
    respostas.forEach((resposta, posicao) => {
      const codigo = grupo[posicao];
      if (resposta.status === "fulfilled") atualizados.set(codigo, resposta.value);
      else if (cache.has(codigo)) atualizados.set(codigo, cache.get(codigo).estabelecimento);
    });
  }
  const novos = [...atualizados.values()];
  if (novos.length) await salvarEstabelecimentos(novos);
  return codigosUnicos.map(codigo => ({
    codigoCnes: codigo,
    estabelecimento: atualizados.get(codigo) || cache.get(codigo)?.estabelecimento || null
  }));
}

module.exports = {
  buscarEstabelecimentos,
  buscarEstabelecimentoPorCnes,
  buscarEstabelecimentosPorCodigos,
  normalizarEstabelecimento,
  ErroApiExterna
};
