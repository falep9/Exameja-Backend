const { getJson, ErroApiExterna } = require("../utils/externalApi");

const API_CNPJ = "https://brasilapi.com.br/api/cnpj/v1";

async function consultarCnpjReceita(cnpj) {
  let dados;
  try {
    dados = await getJson(`${API_CNPJ}/${encodeURIComponent(cnpj)}`, { service: "a consulta oficial de CNPJ" });
  } catch (erro) {
    if (erro.status === 404) return { encontrado: false };
    throw erro;
  }

  const razaoSocial = dados.razao_social || dados.nome || null;
  if (typeof razaoSocial !== "string" || !razaoSocial.trim()) {
    throw new ErroApiExterna("A consulta oficial de CNPJ retornou um cadastro inválido.");
  }
  const cnpjRetornado = String(dados.cnpj || "").replace(/\D/g, "");
  if (cnpjRetornado && cnpjRetornado !== cnpj) return { encontrado: false };
  return { encontrado: true, razaoSocial: razaoSocial.trim() };
}

module.exports = { consultarCnpjReceita };
