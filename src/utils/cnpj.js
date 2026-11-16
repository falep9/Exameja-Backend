const { createHash } = require("node:crypto");

function criarHashCnpj(cnpj) {
  const normalizado = String(cnpj).replace(/[^a-z\d]/gi, "").toUpperCase();
  return createHash("sha256").update(normalizado).digest("hex");
}

module.exports = { criarHashCnpj };
