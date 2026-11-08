const crypto = require("node:crypto");

const DURACAO_SESSAO_MS = 5 * 24 * 60 * 60 * 1000;
const COOKIE_SESSAO = process.env.NODE_ENV === "production"
  ? "__Host-exameja_session"
  : "exameja_session";
const COOKIE_CSRF = process.env.NODE_ENV === "production"
  ? "__Host-exameja_csrf"
  : "exameja_csrf";

function opcoesCookie(maxAge) {
  const sameSite = (process.env.SESSION_COOKIE_SAME_SITE || "lax").toLowerCase();
  if (!["strict", "lax", "none"].includes(sameSite)) {
    throw new Error("SESSION_COOKIE_SAME_SITE deve ser strict, lax ou nenhuma.");
  }
  const secure = process.env.NODE_ENV === "production" || process.env.SESSION_COOKIE_SECURE === "true";
  if (sameSite === "none" && !secure) {
    throw new Error("Cookies SameSite=None exigem SESSION_COOKIE_SECURE=true e HTTPS.");
  }
  return { httpOnly: true, secure, sameSite, path: "/", maxAge };
}

function lerCookies(requisicao) {
  const cabecalho = requisicao.get("cookie") || "";
  return cabecalho.split(";").reduce((cookies, parte) => {
    const separador = parte.indexOf("=");
    if (separador < 1) return cookies;
    const nome = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    try { cookies[nome] = decodeURIComponent(valor); } catch { /* ignora cookie malformado */ }
    return cookies;
  }, {});
}

function criarTokenCsrf() {
  return crypto.randomBytes(32).toString("base64url");
}

function valoresIguais(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function definirCookiesSessao(resposta, cookieSessao, tokenCsrf) {
  resposta.cookie(COOKIE_SESSAO, cookieSessao, opcoesCookie(DURACAO_SESSAO_MS));
  resposta.cookie(COOKIE_CSRF, tokenCsrf, { ...opcoesCookie(DURACAO_SESSAO_MS), httpOnly: false });
}

function limparCookiesSessao(resposta) {
  resposta.clearCookie(COOKIE_SESSAO, { ...opcoesCookie(undefined), maxAge: undefined });
  resposta.clearCookie(COOKIE_CSRF, { ...opcoesCookie(undefined), maxAge: undefined, httpOnly: false });
}

module.exports = {
  COOKIE_SESSAO,
  COOKIE_CSRF,
  DURACAO_SESSAO_MS,
  lerCookies,
  criarTokenCsrf,
  valoresIguais,
  opcoesCookie,
  definirCookiesSessao,
  limparCookiesSessao
};
