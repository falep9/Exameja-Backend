const { geocodingEndereco } = require("../services/geocodingService");

async function buscarCoordenadas(requisicao, resposta, proximaFuncao) {
  try {
    const endereco = typeof requisicao.query.endereco === "string" ? requisicao.query.endereco.trim() : "";
    if (!endereco || endereco.length > 500) {
      return resposta.status(400).json({ message: "Informe um endereço com até 500 caracteres." });
    }
    const coordenadas = await geocodingEndereco(endereco);
    return resposta.status(200).json(coordenadas);
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { buscarCoordenadas };
