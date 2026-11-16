const { getJson, ErroApiExterna } = require("../utils/externalApi");

const API_CNPJ = "https://brasilapi.com.br/api/cnpj/v1";

async function consultarCnpj(cnpj) {
  let dados;
  try {
    dados = await getJson(`${API_CNPJ}/${encodeURIComponent(cnpj)}`, { service: "a consulta de CNPJ da BrasilAPI" });
  } catch (erro) {
    if (erro.status === 404) return { encontrado: false };
    throw erro;
  }

  const razaoSocial = dados.razao_social || dados.nome || null;
  if (typeof razaoSocial !== "string" || !razaoSocial.trim()) {
    throw new ErroApiExterna("A consulta de CNPJ retornou um cadastro inválido.");
  }
  const cnpjRetornado = String(dados.cnpj || "").replace(/[^a-z\d]/gi, "").toUpperCase();
  if (cnpjRetornado && cnpjRetornado !== cnpj.toUpperCase()) return { encontrado: false };
  return { encontrado: true, razaoSocial: razaoSocial.trim() };
}

function normalizarRazaoSocial(valor) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("pt-BR");
}

module.exports = { consultarCnpj, normalizarRazaoSocial };
