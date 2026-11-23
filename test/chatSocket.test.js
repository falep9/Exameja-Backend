const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const variaveisAmbiente = {
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGINS: process.env.CORS_ORIGINS
};
process.env.NODE_ENV = "production";
process.env.CORS_ORIGINS = "https://front.exemplo";

const caminhoAutenticacao = require.resolve("../src/middleware/autenticarUsuario");
const autenticarOriginal = require(caminhoAutenticacao);
const caminhoSocketIo = require.resolve("socket.io");
const socketIoOriginal = require(caminhoSocketIo);
const conversasRepository = require("../src/repositories/conversationsRepository");
const buscarConversaOriginal = conversasRepository.buscarConversa;

const conversas = new Map([
  ["conversa-teste", { clienteUid: "cliente-1", clinicaUid: "clinica-1" }]
]);
conversasRepository.buscarConversa = async id => conversas.get(id) || null;

const usuariosTeste = {
  cliente: { uid: "cliente-1", tipo: "cliente", status: "ativo", administrador: false },
  clinica: { uid: "clinica-1", tipo: "clinica", status: "aprovada", administrador: false },
  outro: { uid: "outro-1", tipo: "cliente", status: "ativo", administrador: false },
  administrador: { uid: "admin-1", tipo: "cliente", status: "ativo", administrador: true },
  suspenso: { uid: "suspenso-1", tipo: "cliente", status: "suspensa", administrador: false }
};

async function autenticarTeste(requisicao, resposta, proximaFuncao) {
  const cookie = requisicao.get("cookie") || "";
  const nomeSessao = cookie.split("=")[1];
  if (nomeSessao === "nao-verificado") {
    return resposta.status(403).json({ message: "Verifique seu e-mail para acessar esta conta." });
  }
  const usuario = usuariosTeste[nomeSessao];
  if (!usuario) return resposta.status(401).json({ message: "Autenticação necessária." });
  requisicao.usuario = usuario;
  return proximaFuncao();
}

require.cache[caminhoAutenticacao].exports = autenticarTeste;

class ServidorSocketFalso {
  constructor(servidorHttp, opcoes) {
    this.servidorHttp = servidorHttp;
    this.opcoes = opcoes;
    this.middlewares = [];
    this.eventos = {};
    this.emissoes = [];
    ServidorSocketFalso.instancia = this;
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  on(evento, handler) {
    this.eventos[evento] = handler;
    return this;
  }

  to(sala) {
    return {
      emit: (evento, dados) => this.emissoes.push({ sala, evento, dados })
    };
  }
}

require.cache[caminhoSocketIo].exports = {
  ...socketIoOriginal,
  Server: ServidorSocketFalso
};
const { iniciarSocket, emitirMensagem } = require("../src/sockets/chatSocket");
require.cache[caminhoSocketIo].exports = socketIoOriginal;

let socketIo;

function criarSocket(nomeSessao, origem = "https://front.exemplo") {
  return {
    request: {
      headers: {
        origin: origem,
        cookie: `exameja_session=${nomeSessao}`
      }
    },
    eventos: {},
    salas: [],
    on(evento, handler) {
      this.eventos[evento] = handler;
    },
    async join(sala) {
      this.salas.push(sala);
    },
    async leave(sala) {
      this.salas = this.salas.filter(item => item !== sala);
    }
  };
}

async function conectar(nomeSessao, origem) {
  if (!socketIo) socketIo = iniciarSocket({});
  const socket = criarSocket(nomeSessao, origem);
  let erro;
  await new Promise(resolve => {
    socketIo.middlewares[0](socket, recebido => {
      erro = recebido;
      resolve();
    });
  });
  if (!erro) socketIo.eventos.connection(socket);
  return { socket, erro };
}

function executarEvento(socket, evento, dados) {
  return new Promise(resolve => {
    socket.eventos[evento](dados, resolve);
  });
}

after(() => {
  require.cache[caminhoAutenticacao].exports = autenticarOriginal;
  conversasRepository.buscarConversa = buscarConversaOriginal;
  if (variaveisAmbiente.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = variaveisAmbiente.NODE_ENV;
  if (variaveisAmbiente.CORS_ORIGINS === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = variaveisAmbiente.CORS_ORIGINS;
});

test("emitir mensagem não quebra antes de iniciar o Socket.IO", () => {
  assert.doesNotThrow(() => emitirMensagem("conversa-teste", {
    id: "mensagem-1",
    remetenteUid: "cliente-1",
    texto: "Olá",
    criadoEm: "agora"
  }));
});

test("conecta com CORS de credenciais e permite os participantes entrarem", async () => {
  const { socket: cliente, erro: erroCliente } = await conectar("cliente");
  const { socket: clinica, erro: erroClinica } = await conectar("clinica");

  assert.equal(erroCliente, undefined);
  assert.equal(erroClinica, undefined);
  assert.equal(socketIo.opcoes.cors.credentials, true);
  assert.deepEqual(await executarEvento(cliente, "entrar-conversa", { conversaId: "conversa-teste" }), { ok: true });
  assert.deepEqual(await executarEvento(clinica, "entrar-conversa", { conversaId: "conversa-teste" }), { ok: true });
  assert.deepEqual(cliente.salas, ["conversa:conversa-teste"]);
  assert.deepEqual(clinica.salas, ["conversa:conversa-teste"]);
});

test("nega entrada de não participante e permite administrador", async () => {
  const { socket: outro } = await conectar("outro");
  const { socket: administrador } = await conectar("administrador");

  assert.deepEqual(await executarEvento(outro, "entrar-conversa", { conversaId: "conversa-teste" }), {
    ok: false,
    mensagem: "Sem permissão"
  });
  assert.deepEqual(await executarEvento(administrador, "entrar-conversa", { conversaId: "conversa-teste" }), { ok: true });
  assert.deepEqual(administrador.salas, ["conversa:conversa-teste"]);
});

test("responde erros para conversa inexistente e identificador inválido", async () => {
  const { socket } = await conectar("cliente");

  assert.deepEqual(await executarEvento(socket, "entrar-conversa", { conversaId: "inexistente" }), {
    ok: false,
    mensagem: "Conversa não encontrada"
  });
  for (const conversaId of [undefined, "", "   ", 123]) {
    assert.deepEqual(await executarEvento(socket, "entrar-conversa", { conversaId }), {
      ok: false,
      mensagem: "conversaId inválido"
    });
  }
});

test("recusa origem não autorizada, sessão não verificada e conta suspensa", async () => {
  const conexaoOrigem = await conectar("cliente", "https://outro.exemplo");
  const conexaoEmail = await conectar("nao-verificado");
  const conexaoSuspensa = await conectar("suspenso");

  assert.match(conexaoOrigem.erro.message, /Origem não autorizada/);
  assert.match(conexaoEmail.erro.message, /Verifique seu e-mail/);
  assert.match(conexaoSuspensa.erro.message, /suspensa/);
});

test("sair da sala e emitir mensagem no formato do REST", async () => {
  const { socket } = await conectar("cliente");
  await executarEvento(socket, "entrar-conversa", { conversaId: "conversa-teste" });
  assert.deepEqual(await executarEvento(socket, "sair-conversa", { conversaId: "conversa-teste" }), { ok: true });
  assert.deepEqual(socket.salas, []);

  const mensagem = {
    id: "mensagem-1",
    remetenteUid: "cliente-1",
    texto: "Olá",
    criadoEm: "agora",
    campoExtra: "não enviar"
  };
  emitirMensagem("conversa-teste", mensagem);
  assert.deepEqual(socketIo.emissoes.at(-1), {
    sala: "conversa:conversa-teste",
    evento: "nova-mensagem",
    dados: {
      id: mensagem.id,
      remetenteUid: mensagem.remetenteUid,
      texto: mensagem.texto,
      criadoEm: mensagem.criadoEm
    }
  });
});
