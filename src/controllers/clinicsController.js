const conveniosRepository = require("../repositories/conveniosRepository");
const { buscarPerfil, decidirStatusClinica } = require("../repositories/usersRepository");

async function sugerirPorConvenio(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "cliente") {
      return resposta.status(403).json({ message: "Esta busca está disponível para contas de cliente." });
    }
    const perfil = await buscarPerfil(requisicao.usuario.uid);
    if (!perfil) return resposta.status(404).json({ message: "Perfil não encontrado." });

    const idsSelecionados = Array.isArray(perfil.convenios) ? perfil.convenios : [];
    if (!idsSelecionados.length) return resposta.status(200).json({ convenios: [], clinicas: [] });

    const catalogo = await conveniosRepository.buscarPorIds(idsSelecionados);
    const idsAtivos = catalogo.filter(convenio => convenio.ativo).map(convenio => convenio.id);
    if (!idsAtivos.length) return resposta.status(200).json({ convenios: [], clinicas: [] });

    const clinicas = await conveniosRepository.listarClinicasPorConvenios(idsAtivos);
    return resposta.status(200).json({
      convenios: catalogo.filter(convenio => convenio.ativo).map(({ id, nome }) => ({ id, nome })),
      clinicas: clinicas.map(clinica => ({
        uid: clinica.uid,
        nomeFantasia: clinica.nomeFantasia,
        endereco: clinica.endereco,
        telefone: clinica.telefone,
        conveniosAceitos: (clinica.conveniosAceitos || []).filter(id => idsAtivos.includes(id))
      }))
    });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function reenviarParaAnalise(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "clinica") {
      return resposta.status(403).json({ message: "Esta ação está disponível para contas de clínica." });
    }
    const clinica = await decidirStatusClinica({
      uid: requisicao.usuario.uid,
      acao: "reenviar",
      atorUid: requisicao.usuario.uid,
      motivo: null
    });
    return resposta.status(200).json({
      message: "Cadastro reenviado para análise.",
      clinica
    });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { sugerirPorConvenio, reenviarParaAnalise };
