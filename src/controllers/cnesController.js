const { buscarEstabelecimentos, buscarEstabelecimentoPorCnes } = require("../services/cnesService");

function validarInteiros(valor, nomeParametro, { minimo = 0, maximo = Number.MAX_SAFE_INTEGER } = {}) {
  if (valor === undefined || valor === "") return undefined;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    const erro = new Error(`O parâmetro '${nomeParametro}' deve ser um número inteiro entre ${minimo} e ${maximo}.`);
    erro.status = 400;
    throw erro;
  }
  return numero;
}

const codigosUfPorSigla = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53
};
const codigosUfValidos = new Set(Object.values(codigosUfPorSigla));

function obterCodigoUf(requisicao) {
  const ufInformada = requisicao.query.uf;
  if (typeof ufInformada === "string" && /^[A-Za-z]{2}$/.test(ufInformada)) {
    const codigoUf = codigosUfPorSigla[ufInformada.toUpperCase()];
    if (!codigoUf) {
      const erro = new Error("Informe uma sigla de UF válida, como SP, ou o código numérico da UF.");
      erro.status = 400;
      throw erro;
    }
    return codigoUf;
  }

  const codigoUf = validarInteiros(
    requisicao.query.codigo_uf || ufInformada,
    "uf",
    { minimo: 11, maximo: 53 }
  );
  if (codigoUf !== undefined && !codigosUfValidos.has(codigoUf)) {
    const erro = new Error("Informe uma UF válida usando a sigla ou o código numérico oficial.");
    erro.status = 400;
    throw erro;
  }
  return codigoUf;
}

async function listarEstabelecimentos(requisicao, resposta, proximaFuncao) {
  try {
    const codigoMunicipio = validarInteiros(requisicao.query.municipio || requisicao.query.codigo_municipio, "municipio");
    const codigoUf = obterCodigoUf(requisicao);
    const limite = validarInteiros(requisicao.query.limit, "limit", { minimo: 1, maximo: 20 }) || 20;
    const deslocamento = validarInteiros(requisicao.query.offset, "offset") || 0;
    const estabelecimentos = await buscarEstabelecimentos({ codigoMunicipio, codigoUf, limite, deslocamento });
    return resposta.status(200).json(estabelecimentos);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function detalharEstabelecimento(requisicao, resposta, proximaFuncao) {
  try {
    const codigoCnes = requisicao.params.codigoCnes;
    if (!/^\d{1,10}$/.test(codigoCnes)) {
      return resposta.status(400).json({ message: "O código CNES deve conter apenas números." });
    }
    const estabelecimento = await buscarEstabelecimentoPorCnes(codigoCnes);
    return resposta.status(200).json(estabelecimento);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listarEstabelecimentos, detalharEstabelecimento };
