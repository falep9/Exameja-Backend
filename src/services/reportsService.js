const repositorio = require("../repositories/reportsRepository");

const TIPOS_ALVO = ["avaliacao", "mensagem", "clinica"];
const CATEGORIAS = ["ofensivo", "spam", "falso", "outro"];

function criarErro(mensagem, status) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function validarDados(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw criarErro("O corpo da requisição deve ser um objeto JSON.", 400);
  }
  const { alvoTipo, alvoId, categoria, descricao } = corpo;
  if (!TIPOS_ALVO.includes(alvoTipo)) throw criarErro("Tipo de alvo inválido.", 400);
  if (typeof alvoId !== "string" || !alvoId.trim() || alvoId.length > 200 || alvoId.includes("/")) {
    throw criarErro("Informe um identificador de alvo válido.", 400);
  }
  if (!CATEGORIAS.includes(categoria)) throw criarErro("Categoria inválida.", 400);
  if (typeof descricao !== "string" || descricao.trim().length < 3 || descricao.trim().length > 500) {
    throw criarErro("A descrição deve conter de 3 a 500 caracteres.", 400);
  }
  return {
    alvoTipo,
    alvoId: alvoId.trim(),
    categoria,
    descricao: descricao.trim()
  };
}

async function criarDenuncia(usuario, corpo) {
  if (usuario?.administrador === true || !["cliente", "clinica"].includes(usuario?.tipo)) {
    throw criarErro("Somente clientes e clínicas podem criar denúncias.", 403);
  }
  const dados = validarDados(corpo);
  const id = `${usuario.uid}_${dados.alvoTipo}_${dados.alvoId}`;
  return repositorio.criarDenuncia({
    id,
    denuncianteUid: usuario.uid,
    ...dados
  });
}

module.exports = { criarDenuncia };
