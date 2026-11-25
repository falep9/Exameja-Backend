const { COOKIE_CSRF, lerCookies, valoresIguais } = require("../utils/sessionCookies");

const METODOS_SEM_MUTACAO = new Set(["GET", "HEAD", "OPTIONS"]);
const origensPermitidas = (process.env.CORS_ORIGINS || "")
  .split(",").map(origem => origem.trim()).filter(Boolean);

function protegerCsrf(requisicao, resposta, proximaFuncao) {
  if (METODOS_SEM_MUTACAO.has(requisicao.method)) return proximaFuncao();
  if (/^Bearer\s+\S+$/i.test(requisicao.get("authorization") || "")) return proximaFuncao();

  const origem = requisicao.get("origin");
  const corsAbertoEmDesenvolvimento = process.env.NODE_ENV !== "production" && origensPermitidas.length === 0;
  if (origem && !origensPermitidas.includes(origem) && !corsAbertoEmDesenvolvimento) {
    return resposta.status(403).json({ code: "ORIGIN_NOT_ALLOWED", message: "A origem desta solicitação não está autorizada. Verifique CORS_ORIGINS no backend." });
  }

  // Login só retorna um Bearer token e não cria cookies; CSRF não se aplica a essa resposta.
  if (requisicao.method === "POST" && requisicao.path === "/api/auth/login") return proximaFuncao();

  const cookies = lerCookies(requisicao);
  const tokenCookie = cookies[COOKIE_CSRF];
  const tokenCabecalho = requisicao.get("x-csrf-token");
  if (!valoresIguais(tokenCookie, tokenCabecalho)) {
    return resposta.status(403).json({ code: "CSRF_TOKEN_INVALID", message: "Token CSRF ausente ou inválido. Para esta operação, obtenha /api/auth/csrf e envie o cookie e o cabeçalho X-CSRF-Token." });
  }
  return proximaFuncao();
}

module.exports = protegerCsrf;
