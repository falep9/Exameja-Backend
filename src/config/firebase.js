const sistemaArquivos = require("node:fs");
const {
  getApps: obterAplicacoesFirebase,
  initializeApp: inicializarAplicacao,
  applicationDefault: obterCredencialPadrao,
  cert: criarCredencialCertificada
} = require("firebase-admin/app");
const { getAuth: obterServicoAutenticacao } = require("firebase-admin/auth");
const { getFirestore: obterServicoFirestore } = require("firebase-admin/firestore");

function obterCredencialFirebase() {
  const contaServicoEmJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (contaServicoEmJson) {
    let contaServico;
    try {
      contaServico = JSON.parse(contaServicoEmJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON precisa conter um JSON válido.");
    }
    return criarCredencialCertificada(contaServico);
  }

  const caminhoCredencial = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (caminhoCredencial) {
    let contaServico;
    try {
      contaServico = JSON.parse(sistemaArquivos.readFileSync(caminhoCredencial, "utf8"));
    } catch (erro) {
      throw new Error(`Não foi possível ler GOOGLE_APPLICATION_CREDENTIALS: ${erro.message}`);
    }
    return criarCredencialCertificada(contaServico);
  }

  const emailContaServico = process.env.FIREBASE_CLIENT_EMAIL;
  const chavePrivada = process.env.FIREBASE_PRIVATE_KEY;
  if (emailContaServico && chavePrivada) {
    return criarCredencialCertificada({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: emailContaServico,
      privateKey: chavePrivada.replace(/\\n/g, "\n")
    });
  }

  return obterCredencialPadrao();
}

function inicializarFirebase() {
  if (obterAplicacoesFirebase().length > 0) return obterAplicacoesFirebase()[0];

  const identificadorProjeto = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  return inicializarAplicacao({
    credential: obterCredencialFirebase(),
    ...(identificadorProjeto ? { projectId: identificadorProjeto } : {})
  });
}

function obterAutenticacaoFirebase() {
  return obterServicoAutenticacao(inicializarFirebase());
}

function obterBancoFirestore() {
  return obterServicoFirestore(inicializarFirebase());
}

module.exports = {
  inicializarFirebase,
  obterAutenticacaoFirebase,
  obterBancoFirestore
};
