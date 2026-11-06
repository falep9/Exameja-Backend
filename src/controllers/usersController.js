const { buscarPerfil } = require("../repositories/usersRepository");

async function obterMeuPerfil(requisicao, resposta, proximaFuncao) {
  try {
    const perfil = await buscarPerfil(requisicao.usuario.uid);
    if (!perfil) return resposta.status(404).json({ message: "Perfil não encontrado." });
    const usuario = {
      uid: perfil.uid,
      email: perfil.email,
      tipo: perfil.tipo,
      status: perfil.status,
      emailVerificado: perfil.emailVerificado,
      criadoEm: perfil.criadoEm,
      atualizadoEm: perfil.atualizadoEm
    };
    if (perfil.tipo === "cliente") usuario.telefone = perfil.telefone;
    if (perfil.tipo === "clinica") {
      Object.assign(usuario, {
        dominioCorporativo: perfil.dominioCorporativo,
        razaoSocial: perfil.razaoSocial,
        nomeFantasia: perfil.nomeFantasia,
        telefone: perfil.telefone
      });
    }
    return resposta.status(200).json({ usuario });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { obterMeuPerfil };
