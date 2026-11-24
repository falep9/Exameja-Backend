const { buscarPerfil } = require("../repositories/usersRepository");
const conveniosRepository = require("../repositories/conveniosRepository");
const ofertasRepository = require("../repositories/examOffersRepository");

async function obterDetalhes(requisicao, resposta, proximaFuncao) {
  try {
    const uid = requisicao.params.uid;
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128 || uid.includes("/")) {
      return resposta.status(400).json({ message: "Identificador de clínica inválido." });
    }

    const perfil = await buscarPerfil(uid);
    if (!perfil || perfil.tipo !== "clinica" || perfil.status !== "aprovada") {
      return resposta.status(404).json({ message: "Clínica não encontrada." });
    }

    const [convenios, ofertas] = await Promise.all([
      conveniosRepository.buscarPorIds(Array.isArray(perfil.conveniosAceitos) ? perfil.conveniosAceitos : []),
      ofertasRepository.listarOfertasClinica(uid)
    ]);
    const coordenadasAtuais = perfil.enderecoCoordenadas === perfil.endereco
      && Number.isFinite(perfil.latitude) && perfil.latitude >= -90 && perfil.latitude <= 90
      && Number.isFinite(perfil.longitude) && perfil.longitude >= -180 && perfil.longitude <= 180;

    resposta.set("Cache-Control", "no-store");
    return resposta.status(200).json({
      clinica: {
        uid,
        nomeFantasia: perfil.nomeFantasia,
        endereco: perfil.endereco,
        telefone: perfil.telefone,
        avaliacaoMedia: Number.isFinite(perfil.avaliacaoMedia) ? perfil.avaliacaoMedia : 0,
        quantidadeAvaliacoes: Number.isSafeInteger(perfil.quantidadeAvaliacoes) ? perfil.quantidadeAvaliacoes : 0,
        ...(coordenadasAtuais ? { latitude: perfil.latitude, longitude: perfil.longitude } : {}),
        conveniosAceitos: convenios.filter(convenio => convenio.ativo)
          .map(({ id, nome }) => ({ id, nome })),
        ofertas: ofertas.map(oferta => ({
          codigoExame: oferta.codigoExame,
          nomeExame: oferta.nomeExame,
          preco: oferta.preco,
          moeda: oferta.moeda || "BRL"
        }))
      }
    });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { obterDetalhes };
