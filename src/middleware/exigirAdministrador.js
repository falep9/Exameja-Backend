function exigirAdministrador(requisicao, resposta, proximaFuncao) {
  if (!requisicao.usuario?.administrador) {
    return resposta.status(403).json({ message: "Acesso restrito à administração." });
  }
  return proximaFuncao();
}

module.exports = exigirAdministrador;
