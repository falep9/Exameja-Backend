function exigirClinicaAprovada(requisicao, resposta, proximaFuncao) {
  if (requisicao.usuario?.tipo === "clinica" && requisicao.usuario?.status !== "aprovada") {
    return resposta.status(403).json({ message: "O acesso às funções da clínica depende da aprovação do cadastro." });
  }
  return proximaFuncao();
}

module.exports = exigirClinicaAprovada;
