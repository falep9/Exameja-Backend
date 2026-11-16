const { buscarClinicas } = require("../services/clinicSearchService");
const { buscarPorIds } = require("../repositories/conveniosRepository");

function erroValidacao(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 400;
  return erro;
}

function texto(query, nome, maximo) {
  if (typeof query !== "string" || !query.trim() || query.trim().length > maximo) {
    throw erroValidacao(`Informe '${nome}' com até ${maximo} caracteres.`);
  }
  return query.trim();
}

function numero(query, nome, { minimo, maximo, padrao } = {}) {
  if (query === undefined || query === "") return padrao;
  if (typeof query !== "string" || !/^-?\d+(?:\.\d+)?$/.test(query)) {
    throw erroValidacao(`O parâmetro '${nome}' deve ser numérico.`);
  }
  const valor = Number(query);
  if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw erroValidacao(`O parâmetro '${nome}' deve estar entre ${minimo} e ${maximo}.`);
  }
  return valor;
}

function inteiro(query, nome, padrao, maximo) {
  if (query === undefined || query === "") return padrao;
  if (typeof query !== "string" || !/^\d+$/.test(query)) throw erroValidacao(`O parâmetro '${nome}' deve ser inteiro.`);
  const valor = Number(query);
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > maximo) throw erroValidacao(`O parâmetro '${nome}' está fora do limite permitido.`);
  return valor;
}

async function buscar(requisicao, resposta, proximaFuncao) {
  try {
    const parametrosPermitidos = new Set([
      "codigoExame", "endereco", "latitude", "longitude", "raioKm",
      "convenioId", "precoMinimo", "precoMaximo", "ordenar", "limit", "offset"
    ]);
    const parametroDesconhecido = Object.keys(requisicao.query)
      .find(parametro => !parametrosPermitidos.has(parametro));
    if (parametroDesconhecido) throw erroValidacao(`O parâmetro '${parametroDesconhecido}' não é permitido.`);

    const temCodigo = requisicao.query.codigoExame !== undefined;
    if (!temCodigo) throw erroValidacao("Informe 'codigoExame' selecionado no catálogo de exames.");
    const codigoExame = temCodigo ? texto(requisicao.query.codigoExame, "codigoExame", 80) : undefined;
    if (codigoExame && !/^[A-Za-z0-9._-]+$/.test(codigoExame)) throw erroValidacao("O código do exame tem caracteres inválidos.");

    const temEndereco = requisicao.query.endereco !== undefined;
    const temLatitude = requisicao.query.latitude !== undefined;
    const temLongitude = requisicao.query.longitude !== undefined;
    if (temEndereco && (temLatitude || temLongitude)) throw erroValidacao("Use endereço ou coordenadas, não ambos.");
    if (!temEndereco && !(temLatitude && temLongitude)) throw erroValidacao("Informe 'endereco' ou os parâmetros 'latitude' e 'longitude'.");
    const endereco = temEndereco ? texto(requisicao.query.endereco, "endereco", 500) : undefined;
    const latitude = temLatitude ? numero(requisicao.query.latitude, "latitude", { minimo: -90, maximo: 90 }) : undefined;
    const longitude = temLongitude ? numero(requisicao.query.longitude, "longitude", { minimo: -180, maximo: 180 }) : undefined;

    const raioKm = numero(requisicao.query.raioKm, "raioKm", { minimo: 1, maximo: 50, padrao: 10 });
    const precoMinimo = numero(requisicao.query.precoMinimo, "precoMinimo", { minimo: 0, maximo: 1000000 });
    const precoMaximo = numero(requisicao.query.precoMaximo, "precoMaximo", { minimo: 0, maximo: 1000000 });
    if (precoMinimo !== undefined && precoMaximo !== undefined && precoMinimo > precoMaximo) {
      throw erroValidacao("'precoMinimo' não pode ser maior que 'precoMaximo'.");
    }
    const convenioId = requisicao.query.convenioId === undefined
      ? undefined
      : texto(requisicao.query.convenioId, "convenioId", 80);
    if (convenioId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(convenioId)) {
      throw erroValidacao("O identificador do convênio tem caracteres inválidos.");
    }
    if (convenioId) {
      const [convenio] = await buscarPorIds([convenioId]);
      if (!convenio?.ativo) throw erroValidacao("O convênio selecionado não se encontra ativo.");
    }
    const ordenar = requisicao.query.ordenar === undefined ? "distancia" : requisicao.query.ordenar;
    if (!new Set(["distancia", "preco"]).has(ordenar)) throw erroValidacao("'ordenar' deve ser 'distancia' ou 'preco'.");

    const limite = inteiro(requisicao.query.limit, "limit", 20, 100);
    if (limite < 1) throw erroValidacao("'limit' precisa ser maior que zero.");
    const resultado = await buscarClinicas({
      codigoExame, latitude, longitude, endereco, raioKm, convenioId, precoMinimo, precoMaximo, ordenar,
      limite,
      deslocamento: inteiro(requisicao.query.offset, "offset", 0, Number.MAX_SAFE_INTEGER)
    });
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { buscar };
