const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rotasCnes = require("./routes/cnesRoutes");
const rotasGeocodificacao = require("./routes/geocodingRoutes");
const rotasExames = require("./routes/examsRoutes");
const { obterBancoFirestore } = require("./config/firebase");

const aplicacao = express();
const limiteCorpo = process.env.JSON_BODY_LIMIT || "1mb";
const origensPermitidas = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(origem => origem.trim())
  .filter(Boolean);

function validarOrigemCors(origem, callback) {
  if (!origem || origensPermitidas.includes(origem)) return callback(null, true);
  if (process.env.NODE_ENV !== "production" && origensPermitidas.length === 0) {
    return callback(null, true);
  }

  const erro = new Error("A origem desta solicitação não está autorizada.");
  erro.status = 403;
  return callback(erro);
}

aplicacao.use(helmet());
aplicacao.use(cors({ origin: validarOrigemCors }));
aplicacao.use(express.json({ limit: limiteCorpo }));
aplicacao.use(express.urlencoded({ extended: false, limit: limiteCorpo }));
aplicacao.use(morgan("dev"));

aplicacao.get("/health", (_requisicao, resposta) => {
  resposta.status(200).json({ status: "ok" });
});

aplicacao.get("/ready", async (_requisicao, resposta) => {
  try {
    await obterBancoFirestore().collection("estabelecimentos").limit(1).get();
    return resposta.status(200).json({ pronto: true, firestore: "conectado" });
  } catch {
    return resposta.status(503).json({ pronto: false, firestore: "indisponivel" });
  }
});

aplicacao.use("/api/cnes", rotasCnes);
aplicacao.use("/api/geocoding", rotasGeocodificacao);
aplicacao.use("/api/exams", rotasExames);

aplicacao.use((requisicao, resposta) => resposta.status(404).json({
  message: "Rota não encontrada.",
  path: requisicao.originalUrl
}));

aplicacao.use((erro, _requisicao, resposta, _proximaFuncao) => {
  const erroDeParse = erro.type === "entity.parse.failed";
  const codigoStatus = erroDeParse ? 400
    : Number.isInteger(erro.status) ? erro.status : 500;
  if (codigoStatus >= 500) console.error("Falha ao processar solicitação:", erro.message);
  return resposta.status(codigoStatus).json({
    message: erroDeParse ? "O corpo da requisição contém JSON inválido."
      : erro.type === "entity.too.large" ? "O corpo da requisição excede o limite permitido."
        : codigoStatus >= 500 ? "Não foi possível processar a solicitação."
          : erro.message || "Não foi possível processar a solicitação."
  });
});

module.exports = aplicacao;
