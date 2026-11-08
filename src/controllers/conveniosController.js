const conveniosRepository = require("../repositories/conveniosRepository");
const {
  validarCriacaoConvenio,
  validarAtualizacaoConvenio
} = require("../validators/conveniosValidator");

async function listar(_requisicao, resposta, proximaFuncao) {
  try {
    return resposta.status(200).json({ convenios: await conveniosRepository.listarAtivos() });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function criar(requisicao, resposta, proximaFuncao) {
  try {
    const dados = validarCriacaoConvenio(requisicao.body);
    await conveniosRepository.criar(dados);
    return resposta.status(201).json({ convenio: { ...dados, ativo: true } });
  } catch (erro) {
    if (erro.code === "already-exists" || erro.code === 6) {
      erro.status = 409;
      erro.message = "Não foi possível criar o convênio com esse ID.";
    }
    return proximaFuncao(erro);
  }
}

async function atualizar(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.params.id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requisicao.params.id)) {
      const erro = new Error("ID de convênio inválido.");
      erro.status = 400;
      throw erro;
    }
    const campos = validarAtualizacaoConvenio(requisicao.body);
    const convenio = await conveniosRepository.atualizar(requisicao.params.id, campos);
    if (!convenio) return resposta.status(404).json({ message: "Convênio não encontrado." });
    return resposta.status(200).json({ convenio });
  } catch (erro) {
    if (erro.code === "not-found" || erro.code === 5) {
      return resposta.status(404).json({ message: "Convênio não encontrado." });
    }
    return proximaFuncao(erro);
  }
}

module.exports = { listar, criar, atualizar };
