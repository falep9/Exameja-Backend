function exigirContaAtiva(requisicao, resposta, proximaFuncao) {
  if (requisicao.usuario?.status === "suspensa") {
    return resposta.status(403).json({ message: "Esta conta está suspensa." });
  }
  return proximaFuncao();
}

module.exports = exigirContaAtiva;
