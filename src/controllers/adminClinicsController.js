const {
  listarClinicasPendentes,
  decidirStatusClinica
} = require("../repositories/usersRepository");

function validarMotivo(corpo, obrigatorio) {
  if (corpo === undefined) corpo = {};
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    const erro = new Error("O corpo da requisição deve ser um objeto JSON.");
    erro.status = 400;
    throw erro;
  }
  const camposDesconhecidos = Object.keys(corpo).some(campo => campo !== "motivo");
  if (camposDesconhecidos) {
    const erro = new Error("Informe somente o campo 'motivo'.");
    erro.status = 400;
    throw erro;
  }
  if (corpo.motivo === undefined && !obrigatorio) return null;
  if (typeof corpo.motivo !== "string" || corpo.motivo.trim().length < 10 || corpo.motivo.trim().length > 500) {
    const erro = new Error("O motivo deve ter entre 10 e 500 caracteres.");
    erro.status = 400;
    throw erro;
  }
  return corpo.motivo.trim();
}

function validarLimite(valor) {
  if (valor === undefined) return 50;
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) {
    const erro = new Error("O limite deve ser um número inteiro entre 1 e 100.");
    erro.status = 400;
    throw erro;
  }
  const limite = Number(valor);
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
    const erro = new Error("O limite deve ser um número inteiro entre 1 e 100.");
    erro.status = 400;
    throw erro;
  }
  return limite;
}

function validarUid(uid) {
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128 || uid.includes("/")) {
    const erro = new Error("Identificador de clínica inválido.");
    erro.status = 400;
    throw erro;
  }
}

async function listarPendentes(requisicao, resposta, proximaFuncao) {
  try {
    const limite = validarLimite(requisicao.query.limit);
    const resultado = await listarClinicasPendentes({ limite, cursor: requisicao.query.cursor });
    return resposta.status(200).json({
      clinicas: resultado.clinicas.map(clinica => ({
        uid: clinica.uid,
        email: clinica.email,
        dominioCorporativo: clinica.dominioCorporativo,
        razaoSocial: clinica.razaoSocial,
        nomeFantasia: clinica.nomeFantasia,
        cnpj: clinica.cnpj,
        declaracaoVinculo: clinica.declaracaoVinculo,
        declaracaoVinculoRecebidaEm: clinica.declaracaoVinculoRecebidaEm,
        consultaCnpj: clinica.consultaCnpj || null,
        cnes: clinica.cnes || null,
        telefone: clinica.telefone,
        endereco: clinica.endereco,
        status: clinica.status,
        criadoEm: clinica.criadoEm
      })),
      proximoCursor: resultado.proximoCursor
    });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

function criarManipuladorDecisao(acao, exigirMotivo = false) {
  return async (requisicao, resposta, proximaFuncao) => {
    try {
      validarUid(requisicao.params.uid);
      const motivo = validarMotivo(requisicao.body, exigirMotivo);
      const clinica = await decidirStatusClinica({
        uid: requisicao.params.uid,
        acao,
        atorUid: requisicao.usuario.uid,
        motivo
      });
      return resposta.status(200).json({ message: "Situação da clínica atualizada.", clinica });
    } catch (erro) {
      return proximaFuncao(erro);
    }
  };
}

module.exports = {
  listarPendentes,
  aprovar: criarManipuladorDecisao("aprovar"),
  rejeitar: criarManipuladorDecisao("rejeitar", true),
  suspender: criarManipuladorDecisao("suspender", true),
  reativar: criarManipuladorDecisao("reativar", true)
};
