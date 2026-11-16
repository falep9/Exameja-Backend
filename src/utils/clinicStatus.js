const TRANSICOES = Object.freeze({
  aprovar: { origem: "pendente", destino: "aprovada" },
  rejeitar: { origem: "pendente", destino: "rejeitada" },
  suspender: { origem: "aprovada", destino: "suspensa" },
  reativar: { origem: "suspensa", destino: "aprovada" },
  reenviar: { origem: "rejeitada", destino: "pendente" }
});

function calcularTransicaoClinica(statusAtual, acao) {
  const transicao = TRANSICOES[acao];
  if (!transicao || statusAtual !== transicao.origem) {
    const erro = new Error("A ação não é permitida para o estado atual da clínica.");
    erro.status = 409;
    throw erro;
  }
  return transicao.destino;
}

module.exports = { calcularTransicaoClinica };
