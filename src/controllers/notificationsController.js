const {
  listarNotificacoes,
  marcarNotificacaoComoLida
} = require("../repositories/usersRepository");

function validarLimite(valor) {
  if (valor === undefined) return 20;
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) {
    const erro = new Error("O limite deve ser um número inteiro entre 1 e 50.");
    erro.status = 400;
    throw erro;
  }
  const limite = Number(valor);
  if (limite < 1 || limite > 50) {
    const erro = new Error("O limite deve ser um número inteiro entre 1 e 50.");
    erro.status = 400;
    throw erro;
  }
  return limite;
}

function validarId(id) {
  if (typeof id !== "string" || id.length < 1 || id.length > 150 || id.includes("/")) {
    const erro = new Error("Identificador de notificação inválido.");
    erro.status = 400;
    throw erro;
  }
}

async function listar(requisicao, resposta, proximaFuncao) {
  try {
    const resultado = await listarNotificacoes(requisicao.usuario.uid, {
      limite: validarLimite(requisicao.query.limit),
      cursor: requisicao.query.cursor
    });
    return resposta.status(200).json({
      notificacoes: resultado.notificacoes.map(({ id, tipo, titulo, mensagem, motivo, status, lida, criadoEm }) => ({
        id, tipo, titulo, mensagem, ...(motivo ? { motivo } : {}), status, lida, criadoEm
      })),
      proximoCursor: resultado.proximoCursor
    });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function marcarComoLida(requisicao, resposta, proximaFuncao) {
  try {
    validarId(requisicao.params.id);
    const atualizada = await marcarNotificacaoComoLida(requisicao.usuario.uid, requisicao.params.id);
    if (!atualizada) return resposta.status(404).json({ message: "Notificação não encontrada." });
    return resposta.status(204).end();
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { listar, marcarComoLida };
