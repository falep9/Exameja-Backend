require("dotenv").config();

const { firebaseEstaConfigurado, obterAutenticacaoFirebase } = require("../src/config/firebase");

async function executar() {
  const [acao, uid] = process.argv.slice(2);
  if (!["conceder", "remover"].includes(acao) || !uid || uid.length > 128 || uid.includes("/")) {
    throw new Error("Uso: node scripts/gerenciarAdministrador.js <conceder|remover> <uid>");
  }
  if (!firebaseEstaConfigurado()) {
    throw new Error("Configure as credenciais do Firebase antes de gerenciar administradores.");
  }

  const autenticacao = obterAutenticacaoFirebase();
  const usuario = await autenticacao.getUser(uid);
  const claims = { ...usuario.customClaims };
  if (acao === "conceder") claims.administrador = true;
  else delete claims.administrador;

  await autenticacao.setCustomUserClaims(uid, claims);
  process.stdout.write(`Permissão de administrador ${acao === "conceder" ? "concedida" : "removida"} para ${uid}.\n`);
  process.stdout.write("A pessoa precisa atualizar o ID token e iniciar uma nova sessão para aplicar a mudança.\n");
}

executar().catch(erro => {
  process.stderr.write(`Falha ao gerenciar administrador: ${erro.message}\n`);
  process.exitCode = 1;
});
