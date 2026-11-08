const { validarDocumento, validarTelefone, textoObrigatorio } = require("./authValidator");
const { validarIdsConvenios } = require("./conveniosValidator");

function validarAtualizacaoPerfil(corpo, tipoUsuario, statusUsuario) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    const erro = new Error("O corpo da requisição deve ser um objeto JSON.");
    erro.status = 400;
    throw erro;
  }

  const camposPermitidos = tipoUsuario === "cliente"
    ? ["cpf", "telefone", "convenios"]
    : ["nomeFantasia", "telefone", "endereco", ...(statusUsuario === "aprovada" ? ["conveniosAceitos"] : [])];
  const desconhecido = Object.keys(corpo).find(campo => !camposPermitidos.includes(campo));
  if (desconhecido) {
    const erro = new Error(`O campo '${desconhecido}' não pode ser alterado por este endpoint.`);
    erro.status = 400;
    throw erro;
  }
  if (Object.keys(corpo).length === 0) {
    const erro = new Error("Informe pelo menos um campo para atualizar.");
    erro.status = 400;
    throw erro;
  }

  const atualizacao = {};
  if (Object.hasOwn(corpo, "telefone")) atualizacao.telefone = validarTelefone(corpo.telefone);
  if (tipoUsuario === "cliente" && Object.hasOwn(corpo, "cpf")) {
    atualizacao.cpf = validarDocumento(corpo.cpf, "CPF", 11);
  }
  if (tipoUsuario === "cliente" && Object.hasOwn(corpo, "convenios")) {
    atualizacao.convenios = validarIdsConvenios(corpo.convenios);
  }
  if (tipoUsuario === "clinica" && Object.hasOwn(corpo, "nomeFantasia")) {
    atualizacao.nomeFantasia = textoObrigatorio(corpo.nomeFantasia, "nomeFantasia", 200);
  }
  if (tipoUsuario === "clinica" && Object.hasOwn(corpo, "endereco")) {
    atualizacao.endereco = textoObrigatorio(corpo.endereco, "endereco", 500);
  }
  if (tipoUsuario === "clinica" && Object.hasOwn(corpo, "conveniosAceitos")) {
    atualizacao.conveniosAceitos = validarIdsConvenios(corpo.conveniosAceitos);
  }
  return atualizacao;
}

module.exports = { validarAtualizacaoPerfil };
