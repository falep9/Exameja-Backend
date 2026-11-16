const ofertasRepository = require("../repositories/examOffersRepository");
const { buscarExamePorCodigo } = require("../services/examsService");

function falha(mensagem, status = 400) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function validarCodigo(codigo) {
  if (typeof codigo !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(codigo)) {
    throw falha("Código de exame inválido.");
  }
  return codigo;
}

function validarOferta(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw falha("O corpo deve ser um objeto JSON.");
  const permitidos = new Set(["nomeExame", "preco", "codigoSigtap", "valorSus"]);
  const desconhecido = Object.keys(corpo).find(campo => !permitidos.has(campo));
  if (desconhecido) throw falha(`O campo '${desconhecido}' não é permitido.`);
  if (corpo.nomeExame !== undefined
    && (typeof corpo.nomeExame !== "string" || !corpo.nomeExame.trim() || corpo.nomeExame.trim().length > 200)) {
    throw falha("O nome do exame, quando informado, deve ter até 200 caracteres.");
  }
  if (typeof corpo.preco !== "number" || !Number.isFinite(corpo.preco) || corpo.preco <= 0 || corpo.preco > 1000000) {
    throw falha("O preço deve ser um número maior que zero e até 1.000.000.");
  }
  const temCodigoSus = corpo.codigoSigtap !== undefined;
  const temValorSus = corpo.valorSus !== undefined;
  if (temCodigoSus !== temValorSus) throw falha("Informe juntos 'codigoSigtap' e 'valorSus' como referência opcional.");
  let referenciaSus;
  if (temCodigoSus) {
    if (typeof corpo.codigoSigtap !== "string" || !/^\d{1,10}$/.test(corpo.codigoSigtap)) {
      throw falha("'codigoSigtap' deve conter de 1 a 10 dígitos.");
    }
    if (typeof corpo.valorSus !== "number" || !Number.isFinite(corpo.valorSus) || corpo.valorSus < 0 || corpo.valorSus > 1000000) {
      throw falha("'valorSus' deve ser um número entre 0 e 1.000.000.");
    }
    referenciaSus = { codigoSigtap: corpo.codigoSigtap, valor: corpo.valorSus };
  }
  return {
    ...(corpo.nomeExame === undefined ? {} : { nomeExame: corpo.nomeExame.trim() }),
    preco: Math.round(corpo.preco * 100) / 100,
    ...(referenciaSus ? { referenciaSus } : {})
  };
}

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "clinica") return resposta.status(403).json({ message: "Apenas clínicas podem gerenciar ofertas." });
    const ofertas = await ofertasRepository.listarOfertasClinica(requisicao.usuario.uid);
    return resposta.status(200).json({ ofertas });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function listarHistorico(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "clinica") return resposta.status(403).json({ message: "Apenas clínicas podem consultar o histórico de suas ofertas." });
    const codigoExame = validarCodigo(requisicao.params.codigoExame);
    const limiteInformado = requisicao.query.limit;
    const limite = limiteInformado === undefined ? 20 : Number(limiteInformado);
    if (typeof limiteInformado !== "undefined"
      && (typeof limiteInformado !== "string" || !/^\d+$/.test(limiteInformado) || !Number.isInteger(limite) || limite < 1 || limite > 100)) {
      throw falha("O parâmetro 'limit' deve ser um inteiro entre 1 e 100.");
    }
    const cursor = requisicao.query.cursor;
    if (cursor !== undefined && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(cursor))) {
      throw falha("O cursor de paginação é inválido.");
    }
    const pagina = await ofertasRepository.listarHistoricoOferta(requisicao.usuario.uid, codigoExame, { limite, cursor });
    return resposta.status(200).json(pagina);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function salvar(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "clinica") return resposta.status(403).json({ message: "Apenas clínicas podem gerenciar ofertas." });
    const codigoExame = validarCodigo(requisicao.params.codigoExame);
    const dados = validarOferta(requisicao.body);
    const exame = await buscarExamePorCodigo(codigoExame);
    if (!exame) throw falha("O código do exame não foi encontrado no catálogo TUSS.", 422);
    dados.nomeExame = exame.nome;
    const oferta = await ofertasRepository.salvarOferta(requisicao.usuario.uid, codigoExame, dados);
    return resposta.status(200).json({ oferta });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function remover(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "clinica") return resposta.status(403).json({ message: "Apenas clínicas podem gerenciar ofertas." });
    const codigoExame = validarCodigo(requisicao.params.codigoExame);
    const removida = await ofertasRepository.desativarOferta(requisicao.usuario.uid, codigoExame);
    if (!removida) return resposta.status(404).json({ message: "Oferta não encontrada." });
    return resposta.status(204).end();
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listar, listarHistorico, salvar, remover };
