require("dotenv").config();

const aplicacao = require("./app");
const { inicializarFirebase, firebaseEstaConfigurado } = require("./config/firebase");

const porta = Number(process.env.PORT) || 3000;

try {
  if (process.env.NODE_ENV === "production") {
    if (!firebaseEstaConfigurado()) throw new Error("Firebase deve estar configurado em produção.");
    if (!process.env.FIREBASE_WEB_API_KEY) throw new Error("FIREBASE_WEB_API_KEY deve estar configurada em produção.");
    if (!process.env.CPF_HMAC_SECRET || process.env.CPF_HMAC_SECRET.length < 32) {
      throw new Error("CPF_HMAC_SECRET deve ter ao menos 32 caracteres em produção.");
    }
    if (!new Set(["strict", "lax", "none"]).has((process.env.SESSION_COOKIE_SAME_SITE || "lax").toLowerCase())) {
      throw new Error("SESSION_COOKIE_SAME_SITE deve ser strict, lax ou none.");
    }
  }
  if (firebaseEstaConfigurado()) inicializarFirebase();
  else console.warn("Firebase sem credenciais; persistência no Firestore desabilitada.");
  aplicacao.listen(porta, () => {
    console.log(`A API do Exame Já está ouvindo na porta ${porta}.`);
  });
} catch (erro) {
  console.error("Não foi possível iniciar a aplicação:", erro.message);
  process.exitCode = 1;
}
