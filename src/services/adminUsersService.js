const repositorio = require("../repositories/adminUsersRepository");

const TIPOS_USUARIO = ["cliente", "clinica"];
const STATUS_USUARIO = ["ativo", "pendente", "aprovada", "rejeitada", "suspensa"];
const STATUS_CLINICA = ["pendente", "aprovada", "rejeitada", "suspensa"];

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
    && (typeof query.cursor !== "string" || !query.cursor || query.cursor.length > 128 || query.cursor.includes("/"))) {
    throw criarErro("Cursor de paginação inválido.", 400);
  }
  return { limite: Math.min(limite, 50), cursor: query.cursor };
}

function validarFiltro(valor, valores, nome) {
  if (valor !== undefined && (typeof valor !== "string" || !valores.includes(valor))) {
    throw criarErro(`Filtro '${nome}' inválido.`, 400);
  }
}

function projetarUsuario(usuario) {
  return {
    uid: usuario.uid,
    tipo: usuario.tipo,
    status: usuario.status,
    email: usuario.email,
    criadoEm: usuario.criadoEm,
    ...(usuario.tipo === "cliente" ? { nome: usuario.nome } : usuario.tipo === "clinica" ? {
      razaoSocial: usuario.razaoSocial,
      nomeFantasia: usuario.nomeFantasia
    } : {})
  };
}

function extrairCidadeUf(endereco) {
  if (endereco && typeof endereco === "object" && !Array.isArray(endereco)) {
    const cidade = typeof endereco.cidade === "string" ? endereco.cidade.trim() : "";
    const uf = typeof endereco.uf === "string" ? endereco.uf.trim() : "";
    return { ...(cidade ? { cidade } : {}), ...(uf ? { uf } : {}) };
  }
  if (typeof endereco !== "string") return {};
  const partes = /(?:^|,)\s*([^,]+?)\s*[-–/]\s*([A-Za-z]{2})(?:\s*,\s*\d{5}-?\d{3})?\s*$/.exec(endereco);
  return partes ? { cidade: partes[1].trim(), uf: partes[2].toUpperCase() } : {};
}

function projetarClinica(clinica) {
  return {
    uid: clinica.uid,
    status: clinica.status,
    email: clinica.email,
    razaoSocial: clinica.razaoSocial,
    nomeFantasia: clinica.nomeFantasia,
    ...extrairCidadeUf(clinica.endereco),
    criadoEm: clinica.criadoEm
  };
}

async function listarUsuarios(query = {}) {
  validarFiltro(query.tipo, TIPOS_USUARIO, "tipo");
  validarFiltro(query.status, STATUS_USUARIO, "status");
  const paginacao = validarPaginacao(query);
  const resultado = await repositorio.listarUsuarios({
    tipo: query.tipo,
    status: query.status,
    ...paginacao
  });
  return {
    usuarios: resultado.usuarios.map(projetarUsuario),
    proximoCursor: resultado.proximoCursor
  };
}

async function listarClinicas(query = {}) {
  validarFiltro(query.status, STATUS_CLINICA, "status");
  const paginacao = validarPaginacao(query);
  const resultado = await repositorio.listarClinicas({
    status: query.status,
    ...paginacao
  });
  return {
    clinicas: resultado.clinicas.map(projetarClinica),
    proximoCursor: resultado.proximoCursor
  };
}

module.exports = { listarUsuarios, listarClinicas };
