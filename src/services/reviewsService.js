const { buscarPerfil } = require("../repositories/usersRepository");
const {
  salvarAvaliacao,
  listarAvaliacoes: buscarAvaliacoes
} = require("../repositories/reviewsRepository");

function validarPaginacao({ limite, cursor }) {
  let limiteValidado = 30;
  if (limite !== undefined) {
    if (typeof limite !== "string" || !/^\d+$/.test(limite)) {
      const erro = new Error("O limite deve ser um número inteiro entre 1 e 50.");
      erro.status = 400;
      throw erro;
    }
    limiteValidado = Number(limite);
    if (!Number.isSafeInteger(limiteValidado) || limiteValidado < 1) {
      const erro = new Error("O limite deve ser um número inteiro entre 1 e 50.");
      erro.status = 400;
      throw erro;
    }
    limiteValidado = Math.min(limiteValidado, 50);
  }

  if (cursor !== undefined
    && (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 128 || cursor.includes("/"))) {
    const erro = new Error("Cursor de paginação inválido.");
    erro.status = 400;
    throw erro;
  }

  return { limite: limiteValidado, cursor };
}

async function avaliarClinica(usuario, dados) {
  // Administradores não avaliam, mesmo quando o tipo da conta é cliente.
  if (usuario.tipo !== "cliente" || usuario.administrador === true) {
    const erro = new Error("Somente clientes podem avaliar clínicas.");
    erro.status = 403;
    throw erro;
  }

  const { clinicaUid, nota, comentario: comentarioInformado } = dados || {};
  if (typeof clinicaUid !== "string" || !clinicaUid.trim()) {
    const erro = new Error("Informe um identificador válido para a clínica.");
    erro.status = 400;
    throw erro;
  }
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    const erro = new Error("A nota deve ser um número inteiro entre 1 e 5.");
    erro.status = 400;
    throw erro;
  }
  if (comentarioInformado !== undefined && typeof comentarioInformado !== "string") {
    const erro = new Error("O comentário deve ser uma string de até 500 caracteres.");
    erro.status = 400;
    throw erro;
  }
  const comentario = comentarioInformado === undefined ? "" : comentarioInformado.trim();
  if (comentario.length > 500) {
    const erro = new Error("O comentário deve ser uma string de até 500 caracteres.");
    erro.status = 400;
    throw erro;
  }

  const uidClinica = clinicaUid.trim();
  const perfilClinica = await buscarPerfil(uidClinica);
  if (!perfilClinica || perfilClinica.tipo !== "clinica") {
    const erro = new Error("Clínica não encontrada.");
    erro.status = 404;
    throw erro;
  }
  if (perfilClinica.status !== "aprovada") {
    const erro = new Error("A clínica ainda não foi aprovada.");
    erro.status = 409;
    throw erro;
  }

  return salvarAvaliacao({
    clienteUid: usuario.uid,
    clinicaUid: uidClinica,
    nota,
    comentario
  });
}

async function listarAvaliacoes(parametros) {
  const { clinicaUid, ...paginacaoInformada } = parametros;
  if (typeof clinicaUid !== "string" || !clinicaUid.trim()) {
    const erro = new Error("Informe o identificador da clínica.");
    erro.status = 400;
    throw erro;
  }
  const paginacao = validarPaginacao(paginacaoInformada);
  return buscarAvaliacoes({ clinicaUid: clinicaUid.trim(), ...paginacao });
}

module.exports = { avaliarClinica, listarAvaliacoes };
