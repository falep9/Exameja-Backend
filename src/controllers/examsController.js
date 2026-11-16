const { buscarCatalogoExames, buscarProducaoSUS } = require("../services/examsService");

function inteiro(query, nome, padrao, minimo, maximo) {
  if (query === undefined || query === "") return padrao;
  if (typeof query !== "string" || !/^\d+$/.test(query)) {
    const erro = new Error(`O parâmetro '${nome}' deve ser um número inteiro.`);
    erro.status = 400;
    throw erro;
  }
  const numero = Number(query);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    const erro = new Error(`O parâmetro '${nome}' deve ser um inteiro entre ${minimo} e ${maximo}.`);
    erro.status = 400;
    throw erro;
  }
  return numero;
}

function texto(query, nome, maximo) {
  if (query === undefined) return undefined;
  if (typeof query !== "string" || query.trim().length > maximo) {
    const erro = new Error(`O parâmetro '${nome}' deve ser texto com até ${maximo} caracteres.`);
    erro.status = 400;
    throw erro;
  }
  return query.trim() || undefined;
}

async function listarCatalogo(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.query.q !== undefined || requisicao.query.termo !== undefined) {
      const erro = new Error("O catálogo é navegável por paginação; não use busca por texto.");
      erro.status = 400;
      throw erro;
    }
    const pagina = inteiro(requisicao.query.page, "page", 1, 1, 10000);
    const limite = inteiro(requisicao.query.limit, "limit", 20, 1, 100);
    return resposta.status(200).json(await buscarCatalogoExames({ pagina, limite }));
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listarProducaoSUS(requisicao, resposta, proximaFuncao) {
  try {
    const ano = requisicao.query.ano === undefined ? undefined
      : inteiro(requisicao.query.ano, "ano", undefined, 2008, 2100);
    const competencia = requisicao.query.competencia === undefined ? undefined
      : inteiro(requisicao.query.competencia, "competencia", undefined, 200801, 210012);
    if (competencia !== undefined && (Number(String(competencia).slice(-2)) < 1
      || Number(String(competencia).slice(-2)) > 12)) {
      const erro = new Error("O mês da competência deve estar entre 01 e 12.");
      erro.status = 400;
      throw erro;
    }
    if (ano !== undefined && competencia !== undefined) {
      const erro = new Error("Informe 'ano' ou 'competencia', não ambos.");
      erro.status = 400;
      throw erro;
    }
    const municipio = requisicao.query.municipio === undefined ? undefined
      : inteiro(requisicao.query.municipio, "municipio", undefined, 1, 9999999);
    const cnes = texto(requisicao.query.cnes, "cnes", 10);
    if (cnes !== undefined && !/^\d{1,10}$/.test(cnes)) {
      const erro = new Error("O parâmetro 'cnes' deve conter de 1 a 10 dígitos.");
      erro.status = 400;
      throw erro;
    }
    if (ano === undefined && competencia === undefined) {
      const erro = new Error("Informe 'ano' ou 'competencia' para consultar a produção SUS.");
      erro.status = 400;
      throw erro;
    }
    if (municipio === undefined && cnes === undefined) {
      const erro = new Error("Informe 'municipio' ou 'cnes' para limitar a consulta SUS.");
      erro.status = 400;
      throw erro;
    }
    const limite = inteiro(requisicao.query.limit, "limit", 20, 1, 20);
    const deslocamento = inteiro(requisicao.query.offset, "offset", 0, 0, 10000000);
    return resposta.status(200).json(await buscarProducaoSUS({ ano, competencia, municipio, cnes, limite, deslocamento }));
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listarCatalogo, listarProducaoSUS };
