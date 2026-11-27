require("dotenv").config();

const { FieldValue } = require("firebase-admin/firestore");
const { firebaseEstaConfigurado, obterBancoFirestore } = require("../src/config/firebase");

const FORMATO_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAMANHO_MAXIMO_ID = 80;
const OPERACOES_POR_LOTE = 400;
const CAMPOS_COM_CONVENIOS = ["convenios", "conveniosAceitos"];

function paraIdValido(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TAMANHO_MAXIMO_ID)
    .replace(/-+$/g, "");
}

function planejarMigracao(convenios, usuarios) {
  const idsExistentes = new Set(convenios.map(({ id }) => id));
  const renomear = new Map();
  const criar = new Map();
  const semIdPossivel = [];

  for (const { id, dados } of convenios) {
    if (FORMATO_ID.test(id) && id.length <= TAMANHO_MAXIMO_ID) continue;
    if (dados?.migradoPara) continue;
    const novoId = paraIdValido(id);
    if (!novoId) {
      semIdPossivel.push(id);
      continue;
    }
    renomear.set(id, novoId);
    if (!idsExistentes.has(novoId) && !criar.has(novoId)) {
      criar.set(novoId, { id: novoId, antigo: id, dados });
    }
  }

  const atualizarUsuarios = [];
  for (const { id, dados } of usuarios) {
    const campos = {};
    for (const campo of CAMPOS_COM_CONVENIOS) {
      const atuais = dados[campo];
      if (!Array.isArray(atuais) || !atuais.some((convenioId) => renomear.has(convenioId))) continue;
      campos[campo] = [...new Set(atuais.map((convenioId) => renomear.get(convenioId) ?? convenioId))];
    }
    if (Object.keys(campos).length) atualizarUsuarios.push({ id, campos });
  }

  return {
    renomear: [...renomear].map(([antigo, novo]) => ({ antigo, novo })),
    criar: [...criar.values()],
    atualizarUsuarios,
    semIdPossivel,
  };
}

async function gravarEmLotes(banco, operacoes) {
  for (let inicio = 0; inicio < operacoes.length; inicio += OPERACOES_POR_LOTE) {
    const lote = banco.batch();
    operacoes.slice(inicio, inicio + OPERACOES_POR_LOTE).forEach((operacao) => operacao(lote));
    await lote.commit();
  }
}

async function executar() {
  if (!firebaseEstaConfigurado()) {
    throw new Error("Configure as credenciais do Firebase antes de normalizar os convênios.");
  }
  const aplicar = process.argv.includes("--aplicar");
  const banco = obterBancoFirestore();
  const [conveniosSnapshot, usuariosSnapshot] = await Promise.all([
    banco.collection("convenios").get(),
    banco.collection("usuarios").get(),
  ]);
  const plano = planejarMigracao(
    conveniosSnapshot.docs.map((documento) => ({ id: documento.id, dados: documento.data() })),
    usuariosSnapshot.docs.map((documento) => ({ id: documento.id, dados: documento.data() })),
  );

  process.stdout.write(`Convênios com ID fora do formato: ${plano.renomear.length}\n`);
  plano.renomear.forEach(({ antigo, novo }) => process.stdout.write(`  "${antigo}" → "${novo}"\n`));
  process.stdout.write(`Convênios novos a criar: ${plano.criar.length}\n`);
  process.stdout.write(`Usuários com convênios a atualizar: ${plano.atualizarUsuarios.length}\n`);
  plano.semIdPossivel.forEach((id) => process.stdout.write(`  Sem ID possível, ignorado: "${id}"\n`));

  if (!aplicar) {
    process.stdout.write("Simulação: nada foi gravado. Rode de novo com --aplicar para gravar.\n");
    return;
  }

  const agora = FieldValue.serverTimestamp();
  const operacoes = [
    ...plano.criar.map(({ id, antigo, dados }) => (lote) => lote.create(banco.collection("convenios").doc(id), {
      ...dados,
      idAnterior: antigo,
      atualizadoEm: agora,
    })),
    ...plano.atualizarUsuarios.map(({ id, campos }) => (lote) => lote.update(banco.collection("usuarios").doc(id), {
      ...campos,
      atualizadoEm: agora,
    })),
    ...plano.renomear.map(({ antigo, novo }) => (lote) => lote.update(banco.collection("convenios").doc(antigo), {
      ativo: false,
      migradoPara: novo,
      atualizadoEm: agora,
    })),
  ];
  await gravarEmLotes(banco, operacoes);
  process.stdout.write(`Migração concluída: ${operacoes.length} gravações. Os IDs antigos ficaram inativos, com o campo migradoPara.\n`);
}

if (require.main === module) {
  executar().catch((erro) => {
    process.stderr.write(`${erro.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { paraIdValido, planejarMigracao };
