const { createHash: criarHash } = require("node:crypto");
const { obterBancoFirestore } = require("../config/firebase");

const URL_NOMINATIM = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const IDENTIFICACAO_APLICACAO = process.env.NOMINATIM_USER_AGENT || "ExameJa/1.0";
const DURACAO_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const INTERVALO_MINIMO_MS = 1000;
const MAXIMO_CONSULTAS_PENDENTES = 30;
const cacheEmMemoria = new Map();
let horarioUltimaConsulta = 0;
let filaConsultas = Promise.resolve();
let quantidadeConsultasPendentes = 0;

function criarChaveCache(endereco) {
  const enderecoNormalizado = endereco.trim().toLocaleLowerCase("pt-BR");
  return criarHash("sha256").update(enderecoNormalizado).digest("hex");
}

function firestoreEstaConfigurado() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  );
}

async function consultarCache(chave) {
  const itemEmMemoria = cacheEmMemoria.get(chave);
  if (itemEmMemoria && itemEmMemoria.expiraEm > Date.now()) return itemEmMemoria.resultado;
  if (itemEmMemoria) cacheEmMemoria.delete(chave);
  if (!firestoreEstaConfigurado()) return undefined;

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
    return dadosCache.resultado;
  } catch (erro) {
    console.warn("Não foi possível consultar o cache do Firestore:", erro.message);
    return undefined;
  }
}

async function salvarNoCache(chave, endereco, resultado) {
  const expiraEm = Date.now() + DURACAO_CACHE_MS;
  cacheEmMemoria.set(chave, { resultado, expiraEm });
  if (!firestoreEstaConfigurado()) return;

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
  if (!firestoreEstaConfigurado()) return;

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

  const esperaNecessaria = Math.max(0, horarioReservado - Date.now());
  if (esperaNecessaria > 0) {
    await new Promise(resolver => setTimeout(resolver, esperaNecessaria));
  }
}

async function buscarCoordenadasNoNominatim(endereco) {
  const url = new URL(URL_NOMINATIM);
  url.searchParams.set("q", endereco);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");

  let resposta;
  try {
    resposta = await fetch(url, {
      headers: {
        "User-Agent": IDENTIFICACAO_APLICACAO,
        "Accept-Language": "pt-BR"
      }
    });
  } catch (erro) {
    const falha = new Error(`Não foi possível se comunicar com o Nominatim: ${erro.message}`);
    falha.status = 502;
    throw falha;
  }

  if (!resposta.ok) {
    const falha = new Error(`O Nominatim respondeu com o status ${resposta.status}.`);
    falha.status = 502;
    throw falha;
  }

  let locaisEncontrados;
  try {
    locaisEncontrados = await resposta.json();
  } catch {
    const falha = new Error("O Nominatim retornou uma resposta JSON inválida.");
    falha.status = 502;
    throw falha;
  }

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

  return {
    encontrado: true,
    latitude: Number(localEncontrado.lat),
    longitude: Number(localEncontrado.lon),
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
