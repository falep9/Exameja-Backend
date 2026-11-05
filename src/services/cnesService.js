const API_CNES = "https://apidadosabertos.saude.gov.br";
const { obterBancoFirestore } = require("../config/firebase");
const { geocodingEndereco } = require("./geocodingService");

class ErroApiExterna extends Error {
  constructor(mensagem, codigoStatus = 502) {
    super(mensagem);
    this.status = codigoStatus;
  }
}

async function buscarRespostaJson(url, nomeServico) {
  let resposta;
  try {
    resposta = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (erro) {
    throw new ErroApiExterna(`Não foi possível se comunicar com ${nomeServico}: ${erro.message}`);
  }

  if (!resposta.ok) {
    const codigoStatus = resposta.status === 404 ? 404 : 502;
    throw new ErroApiExterna(`${nomeServico} respondeu com o status ${resposta.status}.`, codigoStatus);
  }

  try {
    return await resposta.json();
  } catch {
    throw new ErroApiExterna(`A resposta de ${nomeServico} não está em um formato válido.`);
  }
}

function extrairEstabelecimentos(dados) {
  if (Array.isArray(dados)) return dados;
  if (dados && Array.isArray(dados.estabelecimentos)) return dados.estabelecimentos;
  if (dados && Array.isArray(dados.dados)) return dados.dados;
  if (dados && typeof dados === "object") return [dados];
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
  return Number.isFinite(numero) ? numero : null;
}

function normalizarEstabelecimento(registro) {
  const codigoCnes = obterPrimeiroCampo(registro, ["codigo_cnes", "codigo_unidade", "cnes"]);
  const nome = obterPrimeiroCampo(registro, ["nome_fantasia", "nome_estabelecimento", "nome"])
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
    codigoMunicipio: obterPrimeiroCampo(registro, ["codigo_municipio"]),
    uf: obterPrimeiroCampo(registro, ["uf", "sigla_uf", "uf_sigla"]),
    codigoUf: obterPrimeiroCampo(registro, ["codigo_uf"]),
    cep: obterPrimeiroCampo(registro, ["codigo_cep", "cep", "codigo_cep_estabelecimento"]),
    telefone: obterPrimeiroCampo(registro, ["numero_telefone", "telefone", "numero_telefone_estabelecimento"]),
    latitude: obterCoordenada(registro, ["latitude_estabelecimento_decimo_grau", "latitude"]),
    longitude: obterCoordenada(registro, ["longitude_estabelecimento_decimo_grau", "longitude"]),
    origem: "CNES - Dados Abertos do Ministério da Saúde"
  };
}

function firestoreEstaConfigurado() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  );
}

async function salvarEstabelecimentos(estabelecimentos) {
  if (!firestoreEstaConfigurado()) return;

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

  const resposta = await buscarRespostaJson(
    `${API_CNES}/cnes/estabelecimentos?${parametros}`,
    "a API CNES"
  );
  const estabelecimentos = extrairEstabelecimentos(resposta).map(normalizarEstabelecimento);
  await salvarEstabelecimentos(estabelecimentos);

  return { dados: estabelecimentos, limit: Math.min(limite, 20), offset: deslocamento };
}

async function buscarEstabelecimentoPorCnes(codigoCnes) {
  const resposta = await buscarRespostaJson(
    `${API_CNES}/cnes/estabelecimentos/${encodeURIComponent(codigoCnes)}`,
    "a API CNES"
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

module.exports = {
  buscarEstabelecimentos,
  buscarEstabelecimentoPorCnes,
  normalizarEstabelecimento,
  ErroApiExterna
};
