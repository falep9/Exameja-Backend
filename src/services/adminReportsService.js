const repositorio = require("../repositories/adminReportsRepository");

const STATUS_DENUNCIA = ["aberta", "resolvida", "descartada"];
const TIPOS_ALVO = ["avaliacao", "mensagem", "clinica"];

function criarErro(mensagem, status) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function validarPaginacao(query) {
  const valido = typeof query.limite === "string" && /^\d+$/.test(query.limite);
  const limite = query.limite === undefined ? 30 : Number(query.limite);
  if (query.limite !== undefined && (!valido || !Number.isSafeInteger(limite) || limite < 1)) {
    throw criarErro("O limite deve ser um número inteiro entre 1 e 50.", 400);
  }
  if (query.cursor !== undefined
    && (typeof query.cursor !== "string" || !query.cursor || query.cursor.length > 1500 || query.cursor.includes("/"))) {
    throw criarErro("Cursor de paginação inválido.", 400);
  }
  return { limite: Math.min(limite, 50), cursor: query.cursor };
}

function validarFiltro(valor, valores, nome) {
  if (valor !== undefined && (typeof valor !== "string" || !valores.includes(valor))) {
    throw criarErro(`Filtro '${nome}' inválido.`, 400);
  }
}

async function listarDenuncias(query = {}) {
  validarFiltro(query.status, STATUS_DENUNCIA, "status");
  validarFiltro(query.alvoTipo, TIPOS_ALVO, "alvoTipo");
  const resultado = await repositorio.listarDenuncias({
    status: query.status,
    alvoTipo: query.alvoTipo,
    ...validarPaginacao(query)
  });
  return {
    denuncias: resultado.denuncias,
    proximoCursor: resultado.proximoCursor
  };
}

function validarAtualizacao(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw criarErro("O corpo da requisição deve ser um objeto JSON.", 400);
  }
  if (Object.keys(corpo).some(campo => !["acao", "nota"].includes(campo))) {
    throw criarErro("Informe somente os campos 'acao' e 'nota'.", 400);
  }
  if (!["resolver", "descartar"].includes(corpo.acao)) {
    throw criarErro("Ação inválida.", 400);
  }
  if (corpo.nota !== undefined
    && (typeof corpo.nota !== "string" || corpo.nota.length > 300)) {
    throw criarErro("A nota deve conter até 300 caracteres.", 400);
  }
  return { acao: corpo.acao, nota: corpo.nota === undefined ? null : corpo.nota.trim() };
}

async function atualizarDenuncia(usuario, id, corpo) {
  if (typeof id !== "string" || !id || id.length > 1500 || id.includes("/")) {
    throw criarErro("Identificador de denúncia inválido.", 400);
  }
  const { acao, nota } = validarAtualizacao(corpo);
  return repositorio.atualizarDenuncia({ id, acao, nota, adminUid: usuario.uid });
}

module.exports = { listarDenuncias, atualizarDenuncia };
