const conveniosRepository = require("../repositories/conveniosRepository");
const { buscarPerfil, decidirStatusClinica } = require("../repositories/usersRepository");

function validarPaginacaoSugestoes(query) {
  let limite = 20;
  if (query.limite !== undefined) {
    if (typeof query.limite !== "string" || !/^\d+$/.test(query.limite)) {
      const erro = new Error("O parâmetro 'limite' deve ser um inteiro entre 1 e 50.");
      erro.status = 400;
      throw erro;
    }
    limite = Number(query.limite);
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 50) {
      const erro = new Error("O parâmetro 'limite' deve ser um inteiro entre 1 e 50.");
      erro.status = 400;
      throw erro;
    }
  }
  const cursor = query.cursor;
  if (cursor !== undefined
    && (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 128 || cursor.includes("/"))) {
    const erro = new Error("Cursor de paginação inválido.");
    erro.status = 400;
    throw erro;
  }
  return { limite, cursor };
}

async function sugerirPorConvenio(requisicao, resposta, proximaFuncao) {
  try {
    if (requisicao.usuario.tipo !== "cliente") {
      return resposta.status(403).json({ message: "Esta busca está disponível para contas de cliente." });
    }
    const perfil = await buscarPerfil(requisicao.usuario.uid);
    if (!perfil) return resposta.status(404).json({ message: "Perfil não encontrado." });
    const paginacao = validarPaginacaoSugestoes(requisicao.query);

    const idsSelecionados = Array.isArray(perfil.convenios) ? perfil.convenios : [];
    if (!idsSelecionados.length) return resposta.status(200).json({ convenios: [], clinicas: [], proximoCursor: null });

    const catalogo = await conveniosRepository.buscarPorIds(idsSelecionados);
    const idsAtivos = catalogo.filter(convenio => convenio.ativo).map(convenio => convenio.id);
    if (!idsAtivos.length) return resposta.status(200).json({ convenios: [], clinicas: [], proximoCursor: null });

    const pagina = await conveniosRepository.listarClinicasPorConvenios(
      idsAtivos,
      paginacao
    );
    return resposta.status(200).json({
      convenios: catalogo.filter(convenio => convenio.ativo).map(({ id, nome }) => ({ id, nome })),
      clinicas: pagina.clinicas.map(clinica => ({
        uid: clinica.uid,
        nomeFantasia: clinica.nomeFantasia,
        endereco: clinica.endereco,
        telefone: clinica.telefone,
        conveniosAceitos: (clinica.conveniosAceitos || []).filter(id => idsAtivos.includes(id))
      })),
      proximoCursor: pagina.proximoCursor
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
