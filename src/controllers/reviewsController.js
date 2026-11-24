const repository = require("../repositories/reviewsRepository");
const { buscarPerfil } = require("../repositories/usersRepository");

function erro(mensagem, status = 400) {
  const resultado = new Error(mensagem);
  resultado.status = status;
  return resultado;
}

function paginacao(query) {
  const limite = query.limite === undefined ? 20 : Number(query.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw erro("O limite deve ser um inteiro entre 1 e 50.");
  const cursor = query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 128 || cursor.includes("/"))) throw erro("Cursor de paginação inválido.");
  return { limite, cursor };
}

async function criar(req, res, next) {
  try {
    const { agendamentoId, nota, comentario } = req.body || {};
    if (typeof agendamentoId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(agendamentoId)) throw erro("Informe um agendamento válido.");
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw erro("A nota deve ser um inteiro de 1 a 5.");
    if (comentario !== undefined && (typeof comentario !== "string" || comentario.trim().length > 1000)) throw erro("O comentário deve conter até 1000 caracteres.");
    return res.status(201).json(await repository.criar({
      usuario: req.usuario,
      agendamentoId,
      nota,
      ...(comentario?.trim() ? { comentario: comentario.trim() } : {})
    }));
  } catch (e) { return next(e); }
}

async function listar(req, res, next) {
  try {
    const perfil = await buscarPerfil(req.params.uid);
    if (!perfil || perfil.tipo !== "clinica" || perfil.status !== "aprovada") throw erro("Clínica não encontrada.", 404);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      avaliacaoMedia: Number.isFinite(perfil.avaliacaoMedia) ? perfil.avaliacaoMedia : 0,
      quantidadeAvaliacoes: Number.isSafeInteger(perfil.quantidadeAvaliacoes) ? perfil.quantidadeAvaliacoes : 0,
      ...await repository.listar(req.params.uid, paginacao(req.query))
    });
  } catch (e) { return next(e); }
}

module.exports = { criar, listar };
