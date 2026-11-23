const { Server } = require("socket.io");
const autenticarUsuario = require("../middleware/autenticarUsuario");
const exigirContaAtiva = require("../middleware/exigirContaAtiva");
const { buscarConversa } = require("../repositories/conversationsRepository");
const { lerCookies } = require("../utils/sessionCookies");

const origensPermitidas = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(origem => origem.trim())
  .filter(Boolean);

let socketIo;

function origemPermitida(origem) {
  if (!origem || origensPermitidas.includes(origem)) return true;
  return process.env.NODE_ENV !== "production" && origensPermitidas.length === 0;
}

function executarMiddleware(middleware, requisicao) {
  return new Promise((resolver, rejeitar) => {
    let concluido = false;
    const resposta = {
      codigo: 200,
      corpo: null,
      status(codigo) {
        this.codigo = codigo;
        return this;
      },
      json(corpo) {
        this.corpo = corpo;
        if (!concluido) {
          concluido = true;
          resolver({ ok: false, codigo: this.codigo, mensagem: corpo?.message });
        }
        return this;
      }
    };

    const proximaFuncao = erro => {
      if (concluido) return;
      concluido = true;
      if (erro) rejeitar(erro);
      else resolver({ ok: true });
    };

    try {
      Promise.resolve(middleware(requisicao, resposta, proximaFuncao)).catch(rejeitar);
    } catch (erro) {
      rejeitar(erro);
    }
  });
}

function validarConversaId(dados) {
  return typeof dados?.conversaId === "string" && dados.conversaId.trim()
    ? dados.conversaId.trim()
    : null;
}

function responder(acknowledgment, resultado) {
  if (typeof acknowledgment === "function") acknowledgment(resultado);
}

function iniciarSocket(servidorHttp) {
  socketIo = new Server(servidorHttp, {
    cors: {
      origin(origem, callback) {
        if (origemPermitida(origem)) return callback(null, true);
        return callback(new Error("Origem não autorizada."));
      },
      credentials: true
    }
  });

  socketIo.use(async (socket, proximaFuncao) => {
    const requisicao = socket.request;
    const origem = requisicao.headers?.origin;
    if (!origemPermitida(origem)) return proximaFuncao(new Error("Origem não autorizada."));

    if (typeof requisicao.get !== "function") {
      requisicao.get = nome => requisicao.headers?.[nome.toLowerCase()];
    }

    try {
      const autenticacao = await executarMiddleware(autenticarUsuario, requisicao);
      if (!autenticacao.ok) return proximaFuncao(new Error(autenticacao.mensagem || "Autenticação necessária."));

      const contaAtiva = await executarMiddleware(exigirContaAtiva, requisicao);
      if (!contaAtiva.ok) return proximaFuncao(new Error(contaAtiva.mensagem || "Conta sem permissão para conectar."));

      socket.usuario = requisicao.usuario;
      return proximaFuncao();
    } catch (erro) {
      console.error("Falha ao autenticar conexão Socket.IO:", erro);
      return proximaFuncao(new Error("Não foi possível autenticar a conexão."));
    }
  });

  socketIo.on("connection", socket => {
    socket.on("entrar-conversa", async (dados, acknowledgment) => {
      const conversaId = validarConversaId(dados);
      if (!conversaId) {
        return responder(acknowledgment, { ok: false, mensagem: "conversaId inválido" });
      }

      let resultado;
      try {
        const conversa = await buscarConversa(conversaId);
        if (!conversa) {
          resultado = { ok: false, mensagem: "Conversa não encontrada" };
        } else if (socket.usuario.administrador !== true
          && socket.usuario.uid !== conversa.clienteUid
          && socket.usuario.uid !== conversa.clinicaUid) {
          resultado = { ok: false, mensagem: "Sem permissão" };
        } else {
          await socket.join(`conversa:${conversaId}`);
          resultado = { ok: true };
        }
      } catch (erro) {
        console.error("Falha ao entrar na sala de conversa:", erro);
        resultado = { ok: false, mensagem: "Não foi possível entrar na conversa" };
      }
      return responder(acknowledgment, resultado);
    });

    socket.on("sair-conversa", async (dados, acknowledgment) => {
      const conversaId = validarConversaId(dados);
      if (!conversaId) {
        return responder(acknowledgment, { ok: false, mensagem: "conversaId inválido" });
      }

      try {
        await socket.leave(`conversa:${conversaId}`);
        return responder(acknowledgment, { ok: true });
      } catch (erro) {
        console.error("Falha ao sair da sala de conversa:", erro);
        return responder(acknowledgment, { ok: false, mensagem: "Não foi possível sair da conversa" });
      }
    });
  });

  return socketIo;
}

function emitirMensagem(conversaId, mensagem) {
  if (!socketIo) return;
  socketIo.to(`conversa:${conversaId}`).emit("nova-mensagem", {
    id: mensagem.id,
    remetenteUid: mensagem.remetenteUid,
    texto: mensagem.texto,
    criadoEm: mensagem.criadoEm
  });
}

module.exports = { iniciarSocket, emitirMensagem };
