function erroValidacao(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 400;
  return erro;
}

function validarCorpoObjeto(corpo, camposPermitidos) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw erroValidacao("O corpo da requisição deve ser um objeto JSON.");
  }
  const campoDesconhecido = Object.keys(corpo).find(campo => !camposPermitidos.includes(campo));
  if (campoDesconhecido) throw erroValidacao(`O campo '${campoDesconhecido}' não é permitido.`);
}

function validarIdsConvenios(valor) {
  if (!Array.isArray(valor) || valor.length > 10
    || valor.some(id => typeof id !== "string" || id.length > 80
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
    throw erroValidacao("Informe até 10 IDs de convênios válidos.");
  }
  if (new Set(valor).size !== valor.length) throw erroValidacao("Não repita IDs de convênio.");
  return valor;
}

function validarCriacaoConvenio(corpo) {
  validarCorpoObjeto(corpo, ["id", "nome"]);
  if (typeof corpo.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(corpo.id) || corpo.id.length > 80) {
    throw erroValidacao("O ID deve conter letras minúsculas, números e hífens.");
  }
  if (typeof corpo.nome !== "string" || !corpo.nome.trim() || corpo.nome.trim().length > 120) {
    throw erroValidacao("O nome é obrigatório e deve ter até 120 caracteres.");
  }
  return { id: corpo.id, nome: corpo.nome.trim() };
}

function validarAtualizacaoConvenio(corpo) {
  validarCorpoObjeto(corpo, ["nome", "ativo"]);
  if (Object.keys(corpo).length === 0) throw erroValidacao("Informe o nome ou o estado ativo.");
  const campos = {};
  if (Object.hasOwn(corpo, "nome")) {
    if (typeof corpo.nome !== "string" || !corpo.nome.trim() || corpo.nome.trim().length > 120) {
      throw erroValidacao("O nome é obrigatório e deve ter até 120 caracteres.");
    }
    campos.nome = corpo.nome.trim();
  }
  if (Object.hasOwn(corpo, "ativo")) {
    if (typeof corpo.ativo !== "boolean") throw erroValidacao("O campo 'ativo' deve ser booleano.");
    campos.ativo = corpo.ativo;
  }
  return campos;
}

module.exports = { validarIdsConvenios, validarCriacaoConvenio, validarAtualizacaoConvenio };
