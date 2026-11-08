const { COOKIE_CSRF, lerCookies, valoresIguais } = require("../utils/sessionCookies");

const METODOS_SEM_MUTACAO = new Set(["GET", "HEAD", "OPTIONS"]);
const origensPermitidas = (process.env.CORS_ORIGINS || "")
  .split(",").map(origem => origem.trim()).filter(Boolean);

function protegerCsrf(requisicao, resposta, proximaFuncao) {
  if (METODOS_SEM_MUTACAO.has(requisicao.method)) return proximaFuncao();

  const origem = requisicao.get("origin");
  const corsAbertoEmDesenvolvimento = process.env.NODE_ENV !== "production" && origensPermitidas.length === 0;
  if (origem && !origensPermitidas.includes(origem) && !corsAbertoEmDesenvolvimento) {
    return resposta.status(403).json({ message: "A origem desta solicitação não está autorizada." });
  }

  const cookies = lerCookies(requisicao);
  const tokenCookie = cookies[COOKIE_CSRF];
  const tokenCabecalho = requisicao.get("x-csrf-token");
  if (!valoresIguais(tokenCookie, tokenCabecalho)) {
    return resposta.status(403).json({ message: "Token CSRF ausente ou inválido." });
  }
  return proximaFuncao();
}

module.exports = protegerCsrf;
