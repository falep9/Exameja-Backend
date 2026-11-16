const MAXIMO_CHAVES = 10000;

function criarLimitador({ janelaMs, maximo, mensagem }) {
  if (!Number.isInteger(janelaMs) || janelaMs <= 0 || !Number.isInteger(maximo) || maximo <= 0) {
    throw new Error("O limitador exige janela e máximo de requisições como inteiros positivos.");
  }
  const requisicoesPorChave = new Map();
  let ultimaLimpeza = Date.now();

  return function limitarRequisicoes(requisicao, resposta, proximaFuncao) {
    const agora = Date.now();
    if (agora - ultimaLimpeza >= janelaMs) {
      for (const [chave, registro] of requisicoesPorChave) {
        if (agora - registro.inicio >= janelaMs) requisicoesPorChave.delete(chave);
      }
      ultimaLimpeza = agora;
    }

    const chave = requisicao.ip || requisicao.socket.remoteAddress || "desconhecido";
    const registro = requisicoesPorChave.get(chave);
    if (!registro || agora - registro.inicio >= janelaMs) {
      if (!registro && requisicoesPorChave.size >= MAXIMO_CHAVES) {
        requisicoesPorChave.delete(requisicoesPorChave.keys().next().value);
      }
      requisicoesPorChave.set(chave, { inicio: agora, total: 1 });
      return proximaFuncao();
    }
    if (registro.total >= maximo) {
      resposta.set("Retry-After", String(Math.ceil((registro.inicio + janelaMs - agora) / 1000)));
      return resposta.status(429).json({ message: mensagem });
    }
    registro.total += 1;
    return proximaFuncao();
  };
}

module.exports = criarLimitador;
