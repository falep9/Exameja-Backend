require("dotenv").config();

const aplicacao = require("./app");
const { inicializarFirebase, firebaseEstaConfigurado } = require("./config/firebase");

const porta = Number(process.env.PORT) || 3000;

try {
  if (firebaseEstaConfigurado()) inicializarFirebase();
  else console.warn("Firebase sem credenciais; persistência no Firestore desabilitada.");
  aplicacao.listen(porta, () => {
    console.log(`A API do Exame Já está ouvindo na porta ${porta}.`);
  });
} catch (erro) {
  console.error("Não foi possível iniciar a aplicação:", erro.message);
  process.exitCode = 1;
}
