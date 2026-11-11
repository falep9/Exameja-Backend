const { buscarPerfil } = require("../repositories/usersRepository");
const {
  buscarConversa,
  criarOuBuscarConversa,
  salvarMensagem
} = require("../repositories/conversationsRepository");

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

module.exports = { iniciarConversa, enviarMensagem };
