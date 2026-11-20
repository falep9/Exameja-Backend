const { buscarPerfil } = require("../repositories/usersRepository");
const {
  buscarConversa,
  criarOuBuscarConversa,
  listarConversas: buscarConversas,
  listarMensagens: buscarMensagens,
  salvarMensagem
} = require("../repositories/conversationsRepository");

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

async function iniciarConversa(usuario, clinicaUid) {
  if (typeof clinicaUid !== "string" || !clinicaUid.trim()) {
    const erro = new Error("Informe um identificador válido para a clínica.");
    erro.status = 400;
    throw erro;
  }
  if (usuario.tipo !== "cliente") {
    const erro = new Error("Somente clientes podem iniciar uma conversa.");
    erro.status = 403;
    throw erro;
  }

  const perfilClinica = await buscarPerfil(clinicaUid.trim());
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

  return criarOuBuscarConversa({
    clienteUid: usuario.uid,
    clinicaUid: clinicaUid.trim()
  });
}

async function enviarMensagem(usuario, conversaId, texto) {
  if (typeof texto !== "string" || texto.trim().length < 1 || texto.trim().length > 1000) {
    const erro = new Error("O texto deve conter de 1 a 1000 caracteres.");
    erro.status = 400;
    throw erro;
  }

  const conversa = await buscarConversa(conversaId);
  if (!conversa) {
    const erro = new Error("Conversa não encontrada.");
    erro.status = 404;
    throw erro;
  }

  // Administradores não participam do fluxo de mensagens.
  if (usuario.administrador === true
    || (usuario.uid !== conversa.clienteUid && usuario.uid !== conversa.clinicaUid)) {
    const erro = new Error("Somente participantes podem enviar mensagens.");
    erro.status = 403;
    throw erro;
  }

  const outraParteUid = usuario.uid === conversa.clienteUid
    ? conversa.clinicaUid
    : conversa.clienteUid;
  const perfilOutraParte = await buscarPerfil(outraParteUid);
  if (!perfilOutraParte || perfilOutraParte.status === "suspensa"
    || (outraParteUid === conversa.clinicaUid
      && (perfilOutraParte.tipo !== "clinica" || perfilOutraParte.status !== "aprovada"))) {
    const erro = new Error("A outra parte não está disponível para conversar.");
    erro.status = 409;
    throw erro;
  }

  return salvarMensagem({
    conversaId,
    remetenteUid: usuario.uid,
    texto: texto.trim()
  });
}

async function listarMensagens(usuario, conversaId, paginacao) {
  const conversa = await buscarConversa(conversaId);
  if (!conversa) {
    const erro = new Error("Conversa não encontrada.");
    erro.status = 404;
    throw erro;
  }

  if (usuario.administrador !== true
    && usuario.uid !== conversa.clienteUid
    && usuario.uid !== conversa.clinicaUid) {
    const erro = new Error("Somente participantes ou administradores podem ler as mensagens.");
    erro.status = 403;
    throw erro;
  }

  const parametros = validarPaginacao(paginacao);
  return buscarMensagens({ conversaId, ...parametros });
}

async function listarConversas(usuario, paginacao) {
  if (usuario.administrador === true || !["cliente", "clinica"].includes(usuario.tipo)) {
    const erro = new Error("Administradores não podem listar conversas.");
    erro.status = 403;
    throw erro;
  }

  const parametros = validarPaginacao(paginacao);
  return buscarConversas({
    campoUsuario: usuario.tipo === "cliente" ? "clienteUid" : "clinicaUid",
    usuarioUid: usuario.uid,
    ...parametros
  });
}

module.exports = { iniciarConversa, enviarMensagem, listarMensagens, listarConversas };
