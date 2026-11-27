const { listarClinicasNoMapa, RAIO_PADRAO_KM } = require("../services/clinicMapService");

function erroValidacao(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 400;
  return erro;
}

function numero(valor, nome, minimo, maximo) {
  if (typeof valor !== "string" || !/^-?\d+(?:\.\d+)?$/.test(valor)) {
    throw erroValidacao(`O parâmetro '${nome}' deve ser numérico.`);
  }
  const convertido = Number(valor);
  if (!Number.isFinite(convertido) || convertido < minimo || convertido > maximo) {
    throw erroValidacao(`O parâmetro '${nome}' deve estar entre ${minimo} e ${maximo}.`);
  }
  return convertido;
}

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    const permitidos = new Set(["latitude", "longitude", "raioKm", "convenioId"]);
    const desconhecido = Object.keys(requisicao.query).find(parametro => !permitidos.has(parametro));
    if (desconhecido) throw erroValidacao(`O parâmetro '${desconhecido}' não é permitido.`);

    const { latitude, longitude, raioKm, convenioId } = requisicao.query;
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw erroValidacao("Informe 'latitude' e 'longitude' juntos, ou nenhum dos dois para usar Belém.");
    }
    if (convenioId !== undefined && (typeof convenioId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(convenioId) || convenioId.length > 80)) {
      throw erroValidacao("O identificador do convênio tem caracteres inválidos.");
    }
    const resultado = await listarClinicasNoMapa({
      latitude: latitude === undefined ? undefined : numero(latitude, "latitude", -90, 90),
      longitude: longitude === undefined ? undefined : numero(longitude, "longitude", -180, 180),
      raioKm: raioKm === undefined ? RAIO_PADRAO_KM : numero(raioKm, "raioKm", 1, 50),
      convenioId
    });
    return resposta.status(200).json(resultado);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listar };
