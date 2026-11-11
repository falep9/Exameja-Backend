const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const usersRepository = require("../src/repositories/usersRepository");
const conversationsRepository = require("../src/repositories/conversationsRepository");
const buscarPerfilOriginal = usersRepository.buscarPerfil;
const criarOuBuscarConversaOriginal = conversationsRepository.criarOuBuscarConversa;
const buscarConversaOriginal = conversationsRepository.buscarConversa;
const salvarMensagemOriginal = conversationsRepository.salvarMensagem;

let perfilClinica;
let resultadoRepositorio;
let chamadasBuscarPerfil;
let chamadasCriarOuBuscar;
let conversaAtual;
let mensagemSalva;
let chamadasBuscarConversa;
let dadosSalvos;
usersRepository.buscarPerfil = async () => {
  chamadasBuscarPerfil += 1;
  return perfilClinica;
};
conversationsRepository.criarOuBuscarConversa = async () => {
  chamadasCriarOuBuscar += 1;
  return resultadoRepositorio;
};
conversationsRepository.buscarConversa = async () => {
  chamadasBuscarConversa += 1;
  return conversaAtual;
};
conversationsRepository.salvarMensagem = async dados => {
  dadosSalvos = dados;
  return mensagemSalva;
};

const { iniciar, enviar } = require("../src/controllers/conversationsController");

after(() => {
  usersRepository.buscarPerfil = buscarPerfilOriginal;
  conversationsRepository.criarOuBuscarConversa = criarOuBuscarConversaOriginal;
  conversationsRepository.buscarConversa = buscarConversaOriginal;
  conversationsRepository.salvarMensagem = salvarMensagemOriginal;
});

function prepararTeste({ tipo = "cliente", clinica = { tipo: "clinica", status: "aprovada" } } = {}) {
  perfilClinica = clinica;
  resultadoRepositorio = {
    criada: true,
    conversa: {
      id: "cliente-1_clinica-1",
      clienteUid: "cliente-1",
      clinicaUid: "clinica-1",
      ultimaMensagem: null,
      criadoEm: "agora",
      atualizadoEm: "agora"
    }
  };
  chamadasBuscarPerfil = 0;
  chamadasCriarOuBuscar = 0;
  return {
    usuario: { uid: "cliente-1", tipo },
    body: { clinicaUid: "clinica-1" }
  };
}

function respostaFalsa() {
  return {
    codigo: null,
    corpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

async function executar(requisicao) {
  const resposta = respostaFalsa();
  let erro;
  await iniciar(requisicao, resposta, recebido => { erro = recebido; });
  return { resposta, erro };
}

function prepararEnvio({
  uid = "cliente-1",
  tipo = "cliente",
  administrador = false,
  conversa = { clienteUid: "cliente-1", clinicaUid: "clinica-1" },
  perfil = { uid: "clinica-1", tipo: "clinica", status: "aprovada" },
  texto = "  Olá, gostaria de agendar.  "
} = {}) {
  conversaAtual = conversa;
  perfilClinica = perfil;
  mensagemSalva = {
    id: "mensagem-1",
    remetenteUid: uid,
    texto: "Olá, gostaria de agendar.",
    criadoEm: "agora"
  };
  chamadasBuscarPerfil = 0;
  chamadasBuscarConversa = 0;
  dadosSalvos = null;
  return {
    usuario: { uid, tipo, administrador },
    params: { id: "cliente-1_clinica-1" },
    body: { texto }
  };
}

async function executarEnvio(requisicao) {
  const resposta = respostaFalsa();
  let erro;
  await enviar(requisicao, resposta, recebido => { erro = recebido; });
  return { resposta, erro };
}

test("cria conversa e responde 201", async () => {
  const requisicao = prepararTeste();
  const { resposta, erro } = await executar(requisicao);

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 201);
  assert.equal(resposta.corpo.id, "cliente-1_clinica-1");
  assert.equal(resposta.corpo.ultimaMensagem, null);
});

test("reaproveita conversa existente e responde 200", async () => {
  const requisicao = prepararTeste();
  resultadoRepositorio.criada = false;
  const { resposta } = await executar(requisicao);

  assert.equal(resposta.codigo, 200);
  assert.equal(resposta.corpo.id, "cliente-1_clinica-1");
});

test("responde 400 quando clinicaUid não é uma string não vazia", async () => {
  for (const clinicaUid of [undefined, "", "   ", 123]) {
    const requisicao = prepararTeste();
    requisicao.body.clinicaUid = clinicaUid;
    const { resposta, erro } = await executar(requisicao);

    assert.equal(resposta.codigo, null);
    assert.equal(erro.status, 400);
    assert.match(erro.message, /identificador válido/);
  }
});

test("impede clínica de iniciar conversa e responde 403", async () => {
  const requisicao = prepararTeste({ tipo: "clinica" });
  const { erro } = await executar(requisicao);

  assert.equal(erro.status, 403);
  assert.equal(chamadasBuscarPerfil, 0);
  assert.equal(chamadasCriarOuBuscar, 0);
});

test("responde 404 se o perfil não existir ou não for clínica", async () => {
  for (const clinica of [null, { tipo: "cliente", status: "aprovada" }]) {
    const requisicao = prepararTeste({ clinica });
    const { erro } = await executar(requisicao);

    assert.equal(erro.status, 404);
    assert.match(erro.message, /Clínica não encontrada/);
    assert.equal(chamadasCriarOuBuscar, 0);
  }
});

test("responde 409 se a clínica ainda não estiver aprovada", async () => {
  const requisicao = prepararTeste({ clinica: { tipo: "clinica", status: "pendente" } });
  const { erro } = await executar(requisicao);

  assert.equal(erro.status, 409);
  assert.match(erro.message, /ainda não foi aprovada/);
  assert.equal(chamadasCriarOuBuscar, 0);
});

test("envia mensagem aparada e responde 201 com a mensagem salva", async () => {
  const requisicao = prepararEnvio();
  const { resposta, erro } = await executarEnvio(requisicao);

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 201);
  assert.deepEqual(resposta.corpo, mensagemSalva);
  assert.deepEqual(dadosSalvos, {
    conversaId: "cliente-1_clinica-1",
    remetenteUid: "cliente-1",
    texto: "Olá, gostaria de agendar."
  });
});

test("responde 400 para texto vazio ou com mais de 1000 caracteres", async () => {
  for (const texto of ["   ", "a".repeat(1001)]) {
    const requisicao = prepararEnvio({ texto });
    const { erro } = await executarEnvio(requisicao);

    assert.equal(erro.status, 400);
  }
});

test("responde 403 para não participante e administrador", async () => {
  for (const usuario of [
    { uid: "outro-uid", tipo: "cliente" },
    { uid: "cliente-1", tipo: "cliente", administrador: true }
  ]) {
    const requisicao = prepararEnvio(usuario);
    const { erro } = await executarEnvio(requisicao);

    assert.equal(erro.status, 403);
    assert.equal(chamadasBuscarPerfil, 0);
    assert.equal(dadosSalvos, null);
  }
});

test("responde 404 se a conversa não existir", async () => {
  const requisicao = prepararEnvio({ conversa: null });
  const { erro } = await executarEnvio(requisicao);

  assert.equal(erro.status, 404);
  assert.equal(chamadasBuscarPerfil, 0);
});

test("responde 409 quando a outra parte está suspensa", async () => {
  const requisicao = prepararEnvio({
    perfil: { uid: "clinica-1", tipo: "clinica", status: "suspensa" }
  });
  const { erro } = await executarEnvio(requisicao);

  assert.equal(erro.status, 409);
  assert.equal(dadosSalvos, null);
});

test("responde 409 quando a outra parte clínica não está aprovada", async () => {
  const requisicao = prepararEnvio({
    perfil: { uid: "clinica-1", tipo: "clinica", status: "pendente" }
  });
  const { erro } = await executarEnvio(requisicao);

  assert.equal(erro.status, 409);
  assert.equal(dadosSalvos, null);
});
