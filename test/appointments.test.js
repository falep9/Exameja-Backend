const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const usersRepository = require("../src/repositories/usersRepository");
const firebaseConfig = require("../src/config/firebase");
const obterBancoFirestoreOriginal = firebaseConfig.obterBancoFirestore;
let bancoFalso;
firebaseConfig.obterBancoFirestore = () => bancoFalso;
const appointmentsRepository = require("../src/repositories/appointmentsRepository");

const buscarPerfilOriginal = usersRepository.buscarPerfil;
const originaisRepositorio = {
  criar: appointmentsRepository.criarAgendamento,
  listar: appointmentsRepository.listarAgendamentos,
  buscar: appointmentsRepository.buscarAgendamento,
  atualizar: appointmentsRepository.atualizarAgendamento
};

let perfilClinica;
let agendamentoSalvo;
let resultadoListagem;
let agendamentoBuscado;
let resultadoAtualizacao;
let dadosCriacao;
let dadosListagem;
let dadosAtualizacao;
let erroCriacao;
let erroAtualizacao;
let chamadasPerfil;

usersRepository.buscarPerfil = async () => {
  chamadasPerfil += 1;
  return perfilClinica;
};
appointmentsRepository.criarAgendamento = async dados => {
  dadosCriacao = dados;
  if (erroCriacao) throw erroCriacao;
  return agendamentoSalvo;
};
appointmentsRepository.listarAgendamentos = async dados => {
  dadosListagem = dados;
  return resultadoListagem;
};
appointmentsRepository.buscarAgendamento = async () => agendamentoBuscado;
appointmentsRepository.atualizarAgendamento = async dados => {
  dadosAtualizacao = dados;
  if (erroAtualizacao) throw erroAtualizacao;
  return resultadoAtualizacao;
};

const {
  criarAgendamento,
  listarAgendamentos,
  buscarAgendamento,
  atualizarAgendamento
} = require("../src/services/appointmentsService");
const {
  criar,
  listar,
  buscarPorId,
  atualizar
} = require("../src/controllers/appointmentsController");

after(() => {
  usersRepository.buscarPerfil = buscarPerfilOriginal;
  firebaseConfig.obterBancoFirestore = obterBancoFirestoreOriginal;
  appointmentsRepository.criarAgendamento = originaisRepositorio.criar;
  appointmentsRepository.listarAgendamentos = originaisRepositorio.listar;
  appointmentsRepository.buscarAgendamento = originaisRepositorio.buscar;
  appointmentsRepository.atualizarAgendamento = originaisRepositorio.atualizar;
});

function prepararCriacao({ tipo = "cliente", clinica = { tipo: "clinica", status: "aprovada" } } = {}) {
  perfilClinica = clinica;
  agendamentoSalvo = { id: "agendamento-1", status: "pendente" };
  dadosCriacao = null;
  erroCriacao = null;
  chamadasPerfil = 0;
  const data = new Date(Date.now() + 60 * 60 * 1000);
  return {
    usuario: { uid: "cliente-1", tipo },
    body: {
      clinicaUid: "clinica-1",
      nomeExame: " Hemograma ",
      codigoExame: " HEM ",
      dataHora: data.toISOString()
    }
  };
}

function prepararAtualizacao({
  usuario = { uid: "clinica-1", tipo: "clinica" },
  agendamento = { id: "agendamento-1", clienteUid: "cliente-1", clinicaUid: "clinica-1" },
  corpo = { acao: "confirmar" }
} = {}) {
  agendamentoBuscado = agendamento;
  resultadoAtualizacao = { ...agendamento, status: "confirmado" };
  erroAtualizacao = null;
  dadosAtualizacao = null;
  return { usuario, params: { id: "agendamento-1" }, body: corpo };
}

function respostaFalsa() {
  return {
    codigo: null,
    corpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

function criarBancoFalso(documentosIniciais = {}) {
  const documentos = new Map(Object.entries(documentosIniciais));
  let sequencia = 0;
  function referencia(colecao, id) {
    return {
      id,
      caminho: `${colecao}/${id}`,
      async get() {
        const dados = documentos.get(this.caminho);
        return {
          id,
          exists: dados !== undefined,
          data: () => dados,
          get: campo => dados?.[campo]
        };
      }
    };
  }
  return {
    documentos,
    collection(nome) {
      return {
        doc(id) {
          sequencia += id ? 0 : 1;
          return referencia(nome, id || `novo-${sequencia}`);
        }
      };
    },
    async runTransaction(executar) {
      const operacoes = [];
      const transacao = {
        async get(ref) {
          const dados = documentos.get(ref.caminho);
          return {
            id: ref.id,
            exists: dados !== undefined,
            data: () => dados,
            get: campo => dados?.[campo]
          };
        },
        create(ref, dados) { operacoes.push({ tipo: "criar", ref, dados }); },
        update(ref, dados) { operacoes.push({ tipo: "atualizar", ref, dados }); },
        delete(ref) { operacoes.push({ tipo: "apagar", ref }); }
      };
      const resultado = await executar(transacao);
      for (const operacao of operacoes) {
        if (operacao.tipo === "apagar") documentos.delete(operacao.ref.caminho);
        if (operacao.tipo === "criar" || operacao.tipo === "atualizar") {
          documentos.set(operacao.ref.caminho, {
            ...documentos.get(operacao.ref.caminho),
            ...operacao.dados
          });
        }
      }
      return resultado;
    }
  };
}

async function executarControlador(funcao, requisicao) {
  const resposta = respostaFalsa();
  let erro;
  await funcao(requisicao, resposta, recebido => { erro = recebido; });
  return { resposta, erro };
}

test("cria agendamento normalizado com status pendente e responde 201", async () => {
  const requisicao = prepararCriacao();
  const { resposta, erro } = await executarControlador(criar, requisicao);

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 201);
  assert.equal(resposta.corpo.id, "agendamento-1");
  assert.equal(dadosCriacao.nomeExame, "Hemograma");
  assert.equal(dadosCriacao.codigoExame, "HEM");
  assert.equal(dadosCriacao.conversaId, "cliente-1_clinica-1");
  assert.equal(dadosCriacao.dataHora.toDate().getUTCSeconds(), 0);
  assert.equal(dadosCriacao.dataHora.toDate().getUTCMilliseconds(), 0);
});

test("responde 400 para data passada, nome curto e data inválida", async () => {
  for (const alterar of [
    corpo => { corpo.dataHora = new Date(Date.now() - 60000).toISOString(); },
    corpo => { corpo.nomeExame = "a"; },
    corpo => { corpo.dataHora = "2026-02-30T12:00:00Z"; }
  ]) {
    const requisicao = prepararCriacao();
    alterar(requisicao.body);
    await assert.rejects(criarAgendamento(requisicao.usuario, requisicao.body), erro => erro.status === 400);
  }
});

test("impede clínica de criar agendamento", async () => {
  const requisicao = prepararCriacao({ tipo: "clinica" });
  await assert.rejects(criarAgendamento(requisicao.usuario, requisicao.body), erro => erro.status === 403);
  assert.equal(chamadasPerfil, 0);
});

test("responde 404 para clínica inexistente e 409 para clínica não aprovada", async () => {
  for (const clinica of [null, { tipo: "clinica", status: "pendente" }]) {
    const requisicao = prepararCriacao({ clinica });
    await assert.rejects(
      criarAgendamento(requisicao.usuario, requisicao.body),
      erro => erro.status === (clinica ? 409 : 404)
    );
  }
});

test("propaga conflito de horário como 409", async () => {
  const requisicao = prepararCriacao();
  erroCriacao = Object.assign(new Error("Horário indisponível."), { status: 409 });
  await assert.rejects(criarAgendamento(requisicao.usuario, requisicao.body), erro => erro.status === 409);
});

test("a reserva de horário ocupada não cria outro agendamento", async () => {
  const { Timestamp } = require("firebase-admin/firestore");
  const dataHora = Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000));
  const idHorario = `clinica-1_${dataHora.toDate().toISOString()}`;
  bancoFalso = criarBancoFalso({ [`horariosOcupados/${idHorario}`]: { agendamentoId: "existente" } });

  await assert.rejects(originaisRepositorio.criar({
    clienteUid: "cliente-2",
    clinicaUid: "clinica-1",
    nomeExame: "Hemograma",
    dataHora,
    conversaId: "cliente-2_clinica-1"
  }), erro => erro.status === 409);
  assert.equal([...bancoFalso.documentos.keys()].filter(chave => chave.startsWith("agendamentos/")).length, 0);
});

test("lista agendamentos do usuário e trata proximoCursor com e sem próxima página", async () => {
  const usuario = { uid: "cliente-1", tipo: "cliente" };
  resultadoListagem = { agendamentos: [{ id: "a1" }], proximoCursor: "a1" };
  assert.deepEqual(await listarAgendamentos(usuario, { limite: "10" }), resultadoListagem);
  assert.deepEqual(dadosListagem, {
    campoUsuario: "clienteUid", usuarioUid: "cliente-1", limite: 10, cursor: undefined
  });

  resultadoListagem = { agendamentos: [{ id: "a1" }], proximoCursor: null };
  assert.deepEqual(await listarAgendamentos(usuario, {}), resultadoListagem);
});

test("impede administrador de listar", async () => {
  await assert.rejects(
    listarAgendamentos({ uid: "admin-1", tipo: "cliente", administrador: true }, {}),
    erro => erro.status === 403
  );
});

test("busca por id para dono e administrador, mas nega outro usuário", async () => {
  agendamentoBuscado = { id: "a1", clienteUid: "cliente-1", clinicaUid: "clinica-1" };
  assert.equal(await buscarAgendamento({ uid: "cliente-1" }, "a1"), agendamentoBuscado);
  assert.equal(await buscarAgendamento({ uid: "admin-1", administrador: true }, "a1"), agendamentoBuscado);
  await assert.rejects(buscarAgendamento({ uid: "outro" }, "a1"), erro => erro.status === 403);

  agendamentoBuscado = null;
  await assert.rejects(buscarAgendamento({ uid: "cliente-1" }, "ausente"), erro => erro.status === 404);
});

test("GET por id responde com o agendamento", async () => {
  agendamentoBuscado = { id: "a1", clienteUid: "cliente-1" };
  const { resposta, erro } = await executarControlador(buscarPorId, {
    usuario: { uid: "cliente-1" }, params: { id: "a1" }
  });
  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 200);
  assert.deepEqual(resposta.corpo, agendamentoBuscado);
});

test("confirma e recusa pela clínica, exigindo motivo para recusar", async () => {
  let requisicao = prepararAtualizacao({ corpo: { acao: "confirmar" } });
  assert.equal((await atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body)).status, "confirmado");
  assert.equal(dadosAtualizacao.acao, "confirmar");

  requisicao = prepararAtualizacao({ corpo: { acao: "recusar", motivo: "Sem disponibilidade" } });
  await atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body);
  assert.equal(dadosAtualizacao.motivo, "Sem disponibilidade");

  requisicao = prepararAtualizacao({ corpo: { acao: "recusar" } });
  await assert.rejects(
    atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body),
    erro => erro.status === 400
  );
});

test("cancela pelo cliente e não permite ações pela parte errada", async () => {
  const { Timestamp } = require("firebase-admin/firestore");
  const requisicao = prepararAtualizacao({
    usuario: { uid: "cliente-1", tipo: "cliente" },
    corpo: { acao: "cancelar", motivo: "Mudança de planos" }
  });
  await atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body);
  assert.equal(dadosAtualizacao.motivo, "Mudança de planos");

  const outraParte = prepararAtualizacao({
    usuario: { uid: "cliente-1", tipo: "cliente" },
    corpo: { acao: "confirmar" }
  });
  bancoFalso = criarBancoFalso({
    "agendamentos/agendamento-1": {
      clienteUid: "cliente-1",
      clinicaUid: "clinica-1",
      dataHora: Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)),
      status: "pendente"
    }
  });
  await assert.rejects(
    originaisRepositorio.atualizar({
      usuario: outraParte.usuario,
      id: outraParte.params.id,
      acao: outraParte.body.acao
    }),
    erro => erro.status === 403
  );
  assert.equal(dadosAtualizacao, null);
});

test("libera o horário na transação ao recusar e cancelar", async () => {
  const { Timestamp } = require("firebase-admin/firestore");
  const dataHora = new Date(Date.now() + 60 * 60 * 1000);
  for (const acao of ["recusar", "cancelar"]) {
    const horarioId = `clinica-1_${dataHora.toISOString()}`;
    bancoFalso = criarBancoFalso({
      "agendamentos/a1": {
        clienteUid: "cliente-1",
        clinicaUid: "clinica-1",
        dataHora: Timestamp.fromDate(dataHora),
        status: acao === "cancelar" ? "confirmado" : "pendente"
      },
      [`horariosOcupados/${horarioId}`]: { agendamentoId: "a1" }
    });

    await originaisRepositorio.atualizar({
      usuario: acao === "cancelar"
        ? { uid: "cliente-1", tipo: "cliente" }
        : { uid: "clinica-1", tipo: "clinica" },
      id: "a1",
      acao,
      motivo: acao === "recusar" ? "Sem disponibilidade" : undefined
    });
    assert.equal(bancoFalso.documentos.has(`horariosOcupados/${horarioId}`), false);
    assert.equal(bancoFalso.documentos.get("agendamentos/a1").status, acao === "recusar" ? "recusado" : "cancelado");
  }
});

test("responde 409 para transições inválidas", async () => {
  const requisicao = prepararAtualizacao({
    agendamento: { id: "a1", clienteUid: "cliente-1", clinicaUid: "clinica-1", status: "recusado" },
    corpo: { acao: "confirmar" }
  });
  erroAtualizacao = Object.assign(new Error("A ação não é permitida."), { status: 409 });
  await assert.rejects(
    atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body),
    erro => erro.status === 409
  );
});

test("administrador não pode alterar agendamento", async () => {
  const { Timestamp } = require("firebase-admin/firestore");
  bancoFalso = criarBancoFalso({
    "agendamentos/agendamento-1": {
      clienteUid: "cliente-1",
      clinicaUid: "clinica-1",
      dataHora: Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)),
      status: "pendente"
    }
  });
  await assert.rejects(
    originaisRepositorio.atualizar({
      usuario: { uid: "admin-1", tipo: "cliente", administrador: true },
      id: "agendamento-1",
      acao: "confirmar"
    }),
    erro => erro.status === 403
  );
});

test("responde 400 para ação desconhecida e motivo inválido", async () => {
  const requisicao = prepararAtualizacao({ corpo: { acao: "remarcar" } });
  await assert.rejects(
    atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body),
    erro => erro.status === 400
  );
  requisicao.body = { acao: "cancelar", motivo: "x".repeat(301) };
  await assert.rejects(
    atualizarAgendamento(requisicao.usuario, requisicao.params.id, requisicao.body),
    erro => erro.status === 400
  );
});

test("PUT responde 200 com o agendamento atualizado", async () => {
  const requisicao = prepararAtualizacao();
  const { resposta, erro } = await executarControlador(atualizar, requisicao);
  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 200);
  assert.deepEqual(resposta.corpo, resultadoAtualizacao);
});
