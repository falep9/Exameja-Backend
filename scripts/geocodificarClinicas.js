require("dotenv").config();

const { firebaseEstaConfigurado, obterBancoFirestore } = require("../src/config/firebase");
const { geocodingEndereco } = require("../src/services/geocodingService");
const { salvarCoordenadasClinica } = require("../src/repositories/usersRepository");

async function executar() {
  if (!firebaseEstaConfigurado()) {
    throw new Error("Configure as credenciais do Firebase antes de geocodificar clínicas.");
  }

  const snapshot = await obterBancoFirestore().collection("usuarios")
    .where("tipo", "==", "clinica")
    .where("status", "==", "aprovada")
    .get();
  let atualizadas = 0;
  let semResultado = 0;

  for (const documento of snapshot.docs) {
    const clinica = documento.data();
    if (typeof clinica.endereco !== "string" || !clinica.endereco.trim()) {
      semResultado += 1;
      continue;
    }
    const coordenadasAtuais = clinica.enderecoCoordenadas === clinica.endereco
      && Number.isFinite(clinica.latitude) && clinica.latitude >= -90 && clinica.latitude <= 90
      && Number.isFinite(clinica.longitude) && clinica.longitude >= -180 && clinica.longitude <= 180;
    if (coordenadasAtuais) continue;

    try {
      const resultado = await geocodingEndereco(`${clinica.endereco.trim()}, Brasil`);
      if (!resultado.encontrado) {
        semResultado += 1;
        continue;
      }
      await salvarCoordenadasClinica(documento.id, clinica.endereco, resultado.latitude, resultado.longitude);
      atualizadas += 1;
    } catch (erro) {
      process.stderr.write(`Não foi possível geocodificar a clínica ${documento.id}: ${erro.message}\n`);
    }
  }

  process.stdout.write(`Coordenadas atualizadas: ${atualizadas}. Sem resultado ou endereço: ${semResultado}.\n`);
}

executar().catch(erro => {
  process.stderr.write(`Falha na geocodificação de clínicas: ${erro.message}\n`);
  process.exitCode = 1;
});
