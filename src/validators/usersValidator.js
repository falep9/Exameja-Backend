const { validarTelefone, validarDocumento, textoObrigatorio } = require("./authValidator");
const { validarIdsConvenios } = require("./conveniosValidator");

function validarAtualizacaoPerfil(corpo, tipoUsuario, statusUsuario) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    const erro = new Error("O corpo da requisição deve ser um objeto JSON.");
    erro.status = 400;
    throw erro;
  }

  const camposPermitidos = tipoUsuario === "cliente"
    ? ["nome", "telefone", "convenios"]
    : ["nomeFantasia", "telefone", "endereco", "conveniosAceitos",
      ...(statusUsuario === "rejeitada" ? ["razaoSocial", "cnpj", "cnes", "declaracaoVinculo"] : [])];
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
  if (tipoUsuario === "cliente" && Object.hasOwn(corpo, "nome")) {
    atualizacao.nome = textoObrigatorio(corpo.nome, "nome", 120);
  }
  if (Object.hasOwn(corpo, "telefone")) atualizacao.telefone = validarTelefone(corpo.telefone);
  if (tipoUsuario === "cliente" && Object.hasOwn(corpo, "convenios")) {
    atualizacao.convenios = validarIdsConvenios(corpo.convenios, { minimo: 0, maximo: 1 });
  }
  if (tipoUsuario === "clinica" && Object.hasOwn(corpo, "nomeFantasia")) {
    atualizacao.nomeFantasia = textoObrigatorio(corpo.nomeFantasia, "nomeFantasia", 200);
  }
  if (tipoUsuario === "clinica" && Object.hasOwn(corpo, "endereco")) {
    atualizacao.endereco = textoObrigatorio(corpo.endereco, "endereco", 500);
  }
  if (tipoUsuario === "clinica" && statusUsuario === "rejeitada" && Object.hasOwn(corpo, "razaoSocial")) {
    atualizacao.razaoSocial = textoObrigatorio(corpo.razaoSocial, "razaoSocial", 200);
  }
  if (tipoUsuario === "clinica" && statusUsuario === "rejeitada" && Object.hasOwn(corpo, "cnpj")) {
    atualizacao.cnpj = validarDocumento(corpo.cnpj, "CNPJ", 14);
  }
  if (tipoUsuario === "clinica" && statusUsuario === "rejeitada" && Object.hasOwn(corpo, "cnes")) {
    if (corpo.cnes === null || corpo.cnes === "") atualizacao.cnes = null;
    else if (typeof corpo.cnes !== "string" || !/^\d{1,10}$/.test(corpo.cnes)) {
      const erro = new Error("O CNES deve conter de 1 a 10 dígitos ou ser removido.");
      erro.status = 400;
      throw erro;
    } else atualizacao.cnes = corpo.cnes;
  }
  if (tipoUsuario === "clinica" && statusUsuario === "rejeitada" && Object.hasOwn(corpo, "declaracaoVinculo")) {
    atualizacao.declaracaoVinculo = textoObrigatorio(corpo.declaracaoVinculo, "declaracaoVinculo", 5000);
  }
  if (tipoUsuario === "clinica" && Object.hasOwn(corpo, "conveniosAceitos")) {
    atualizacao.conveniosAceitos = validarIdsConvenios(corpo.conveniosAceitos, { minimo: 5, maximo: 10 });
  }
  return atualizacao;
}

module.exports = { validarAtualizacaoPerfil };
