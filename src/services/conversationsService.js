const { buscarPerfil } = require("../repositories/usersRepository");
const { criarOuBuscarConversa } = require("../repositories/conversationsRepository");

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

module.exports = { iniciarConversa };
