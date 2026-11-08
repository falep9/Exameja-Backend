const { createHmac } = require("node:crypto");

function criarHashCpf(cpf) {
  const segredo = process.env.CPF_HMAC_SECRET;
  if (!segredo || segredo.length < 32) {
    const erro = new Error("CPF_HMAC_SECRET precisa ter ao menos 32 caracteres.");
    erro.status = 503;
    throw erro;
  }
  return createHmac("sha256", segredo).update(cpf).digest("hex");
}

module.exports = { criarHashCpf };
