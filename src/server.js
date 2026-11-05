require("dotenv").config();

const aplicacao = require("./app");
const { inicializarFirebase } = require("./config/firebase");

const porta = Number(process.env.PORT) || 3000;

try {
  const possuiCredenciaisFirebase = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
  if (possuiCredenciaisFirebase) inicializarFirebase();
  else console.warn("Firebase sem credenciais; persistência no Firestore desabilitada.");
  aplicacao.listen(porta, () => {
    console.log(`A API do Exame Já está ouvindo na porta ${porta}.`);
  });
} catch (erro) {
  console.error("Não foi possível iniciar a aplicação:", erro.message);
  process.exitCode = 1;
}
