const { createHash: criarHash } = require("node:crypto");
const { obterBancoFirestore, firebaseEstaConfigurado } = require("../config/firebase");
const { getJson } = require("../utils/externalApi");

const URL_NOMINATIM = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const IDENTIFICACAO_APLICACAO = process.env.NOMINATIM_USER_AGENT || "ExameJa/1.0";
const DURACAO_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const INTERVALO_MINIMO_MS = 1000;
const MAXIMO_CONSULTAS_PENDENTES = 30;
const MAXIMO_ITENS_CACHE_MEMORIA = 1000;
const cacheEmMemoria = new Map();
let horarioUltimaConsulta = 0;
let filaConsultas = Promise.resolve();
let quantidadeConsultasPendentes = 0;
let avisouLimitadorGlobalIndisponivel = false;

function criarChaveCache(endereco) {
  const enderecoNormalizado = endereco.trim().toLocaleLowerCase("pt-BR");
  return criarHash("sha256").update(enderecoNormalizado).digest("hex");
}

async function consultarCache(chave) {
  const itemEmMemoria = cacheEmMemoria.get(chave);
  if (itemEmMemoria && itemEmMemoria.expiraEm > Date.now()) return itemEmMemoria.resultado;
  if (itemEmMemoria) cacheEmMemoria.delete(chave);
  if (!firebaseEstaConfigurado()) return undefined;

  try {
    const documento = await obterBancoFirestore()
      .collection("geocoding_cache")
      .doc(chave)
      .get();
    if (!documento.exists) return undefined;

    const dadosCache = documento.data();
    if (!dadosCache.expiraEm || dadosCache.expiraEm <= Date.now()) return undefined;
    cacheEmMemoria.set(chave, {
      resultado: dadosCache.resultado,
      expiraEm: dadosCache.expiraEm
    });
    if (cacheEmMemoria.size > MAXIMO_ITENS_CACHE_MEMORIA) {
      cacheEmMemoria.delete(cacheEmMemoria.keys().next().value);
    }
    return dadosCache.resultado;
  } catch (erro) {
    console.warn("Não foi possível consultar o cache do Firestore:", erro.message);
    return undefined;
  }
}

async function salvarNoCache(chave, endereco, resultado) {
  const expiraEm = Date.now() + DURACAO_CACHE_MS;
  cacheEmMemoria.set(chave, { resultado, expiraEm });
  if (cacheEmMemoria.size > MAXIMO_ITENS_CACHE_MEMORIA) {
    cacheEmMemoria.delete(cacheEmMemoria.keys().next().value);
  }
  if (!firebaseEstaConfigurado()) return;

  try {
    await obterBancoFirestore().collection("geocoding_cache").doc(chave).set({
      endereco,
      resultado,
      atualizadoEm: new Date().toISOString(),
      expiraEm
    });
  } catch (erro) {
    console.warn("Não foi possível salvar o cache no Firestore:", erro.message);
  }
}

function executarNaFila(tarefa) {
  if (quantidadeConsultasPendentes >= MAXIMO_CONSULTAS_PENDENTES) {
    const erro = new Error("Há muitas consultas de endereço aguardando. Tente novamente em instantes.");
    erro.status = 429;
    return Promise.reject(erro);
  }

  quantidadeConsultasPendentes += 1;
  const resultado = filaConsultas.then(async () => {
    const tempoDesdeUltimaConsulta = Date.now() - horarioUltimaConsulta;
    const esperaNecessaria = Math.max(0, INTERVALO_MINIMO_MS - tempoDesdeUltimaConsulta);
    if (esperaNecessaria > 0) {
      await new Promise(resolver => setTimeout(resolver, esperaNecessaria));
    }

    await reservarHorarioGlobal();
    horarioUltimaConsulta = Date.now();
    return tarefa();
  });

  filaConsultas = resultado.catch(() => {});
  return resultado.finally(() => {
    quantidadeConsultasPendentes -= 1;
  });
}

async function reservarHorarioGlobal() {
  if (!firebaseEstaConfigurado()) return;

  try {
    const banco = obterBancoFirestore();
    const referencia = banco.collection("_controles_integracao").doc("nominatim");
    const horarioReservado = await banco.runTransaction(async transacao => {
      const documento = await transacao.get(referencia);
      const dadosControle = documento.exists ? documento.data() : {};
      const horarioAgora = Date.now();
      const horarioPermitido = Math.max(horarioAgora, dadosControle.proximaConsultaEm || 0);

      transacao.set(referencia, {
        proximaConsultaEm: horarioPermitido + INTERVALO_MINIMO_MS,
        atualizadoEm: new Date(horarioAgora).toISOString()
      });
      return horarioPermitido;
    });
    avisouLimitadorGlobalIndisponivel = false;

    const esperaNecessaria = Math.max(0, horarioReservado - Date.now());
    if (esperaNecessaria > 0) {
      await new Promise(resolver => setTimeout(resolver, esperaNecessaria));
    }
  } catch (erro) {
    if (!avisouLimitadorGlobalIndisponivel) {
      console.warn("Rate limit global do Nominatim indisponível; aplicando o limite local:", erro.code || erro.name);
      avisouLimitadorGlobalIndisponivel = true;
    }
  }
}

async function buscarCoordenadasNoNominatim(endereco) {
  const url = new URL(URL_NOMINATIM);
  url.searchParams.set("q", endereco);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");

  const locaisEncontrados = await getJson(url, {
    service: "o Nominatim",
    headers: {
      "User-Agent": IDENTIFICACAO_APLICACAO,
      "Accept-Language": "pt-BR"
    }
  });

  const localEncontrado = Array.isArray(locaisEncontrados) ? locaisEncontrados[0] : null;
  if (!localEncontrado) {
    return {
      encontrado: false,
      latitude: null,
      longitude: null,
      enderecoFormatado: null,
      atribuicao: "© OpenStreetMap contributors"
    };
  }

  const latitude = Number(localEncontrado.lat);
  const longitude = Number(localEncontrado.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    const erro = new Error("O Nominatim retornou coordenadas inválidas.");
    erro.status = 502;
    throw erro;
  }

  return {
    encontrado: true,
    latitude,
    longitude,
    enderecoFormatado: localEncontrado.display_name || null,
    atribuicao: "OpenStreetMap contributors"
  };
}

async function geocodingEndereco(endereco) {
  const enderecoNormalizado = endereco.trim();
  const chave = criarChaveCache(enderecoNormalizado);
  const resultadoEmCache = await consultarCache(chave);
  if (resultadoEmCache !== undefined) return resultadoEmCache;

  return executarNaFila(async () => {
    const resultadoJaSalvo = await consultarCache(chave);
    if (resultadoJaSalvo !== undefined) return resultadoJaSalvo;

    const resultado = await buscarCoordenadasNoNominatim(enderecoNormalizado);
    await salvarNoCache(chave, enderecoNormalizado, resultado);
    return resultado;
  });
}

module.exports = { geocodingEndereco };
