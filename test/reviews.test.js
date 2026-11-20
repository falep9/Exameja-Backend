const { test, after } = require("node:test");
const assert = require("node:assert/strict");

class SnapshotFalso {
  constructor(id, dados) {
    this.id = id;
    this.ref = { id };
    this.dados = dados;
    this.exists = dados !== undefined;
  }

  data() { return this.dados && { ...this.dados }; }
  get(campo) { return this.dados?.[campo]; }
}

class ReferenciaFalsa {
  constructor(banco, colecao, id) {
    this.banco = banco;
    this.colecao = colecao;
    this.id = id;
  }

  chave() { return `${this.colecao}/${this.id}`; }
  async get() { return new SnapshotFalso(this.id, this.banco.documentos.get(this.chave())); }
}

class ConsultaFalsa {
  constructor(banco, colecao) {
    this.banco = banco;
    this.colecao = colecao;
    this.filtros = [];
    this.limiteConsulta = Infinity;
    this.cursor = null;
  }

  where(campo, operador, valor) {
    assert.equal(operador, "==");
    this.filtros.push([campo, valor]);
    return this;
  }
  orderBy(campo, direcao) {
    this.campoOrdenacao = campo;
    this.direcao = direcao;
    return this;
  }
  startAfter(documento) { this.cursor = documento.id; return this; }
  limit(limite) { this.limiteConsulta = limite; return this; }
  async get() {
    const prefixo = `${this.colecao}/`;
    let documentos = [...this.banco.documentos.entries()]
      .filter(([chave]) => chave.startsWith(prefixo))
      .map(([chave, dados]) => new SnapshotFalso(chave.slice(prefixo.length), dados))
      .filter(documento => this.filtros.every(([campo, valor]) => documento.get(campo) === valor));
    if (this.campoOrdenacao) {
      documentos.sort((a, b) => {
        const diferenca = a.get(this.campoOrdenacao) - b.get(this.campoOrdenacao);
        return this.direcao === "desc" ? -diferenca : diferenca;
      });
    }
    if (this.cursor) {
      documentos = documentos.slice(documentos.findIndex(documento => documento.id === this.cursor) + 1);
    }
    return { docs: documentos.slice(0, this.limiteConsulta) };
  }
}

class BancoFalso {
  constructor() { this.limpar(); }
  limpar() { this.documentos = new Map(); }
  collection(nome) {
    return {
      doc: id => new ReferenciaFalsa(this, nome, id),
      where: (...argumentos) => new ConsultaFalsa(this, nome).where(...argumentos)
    };
  }
  async runTransaction(callback) {
    const operacoes = [];
    const transacao = {
      get: referencia => referencia.get(),
      create: (referencia, dados) => operacoes.push(["create", referencia, dados]),
      update: (referencia, dados) => operacoes.push(["update", referencia, dados])
    };
    const resultado = await callback(transacao);
    for (const [acao, referencia, dados] of operacoes) {
      const existente = this.documentos.get(referencia.chave());
      if (acao === "create" && existente) throw new Error("Documento duplicado");
      if (acao === "update" && !existente) throw new Error("Documento ausente");
      this.documentos.set(referencia.chave(), {
        ...(acao === "update" ? existente : {}),
        ...dados
      });
    }
    return resultado;
  }
}

const bancoFalso = new BancoFalso();
const configFirebase = require("../src/config/firebase");
const obterBancoOriginal = configFirebase.obterBancoFirestore;
configFirebase.obterBancoFirestore = () => bancoFalso;
const usersRepository = require("../src/repositories/usersRepository");
const buscarPerfilOriginal = usersRepository.buscarPerfil;
usersRepository.buscarPerfil = async uid => bancoFalso.documentos.get(`usuarios/${uid}`) || null;
const { avaliar, listar } = require("../src/controllers/reviewsController");

after(() => {
  configFirebase.obterBancoFirestore = obterBancoOriginal;
  usersRepository.buscarPerfil = buscarPerfilOriginal;
});

function prepararClinica(perfil = { tipo: "clinica", status: "aprovada" }) {
  bancoFalso.limpar();
  if (perfil) bancoFalso.documentos.set("usuarios/clinica-1", { ...perfil });
}

function respostaFalsa() {
  return {
    codigo: null,
    corpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

async function executar(funcao, requisicao) {
  const resposta = respostaFalsa();
  let erro;
  await funcao(requisicao, resposta, recebido => { erro = recebido; });
  return { resposta, erro };
}

function requisicaoAvaliacao({
  tipo = "cliente",
  administrador = false,
  clinicaUid = "clinica-1",
  nota = 5,
  comentario
} = {}) {
  return {
    usuario: { uid: "cliente-1", tipo, administrador },
    body: { clinicaUid, nota, ...(comentario !== undefined ? { comentario } : {}) }
  };
}

test("cria avaliação e atualiza os agregados da clínica", async () => {
  prepararClinica();
  const { resposta, erro } = await executar(avaliar, requisicaoAvaliacao({
    nota: 5,
    comentario: "  Atendimento ótimo.  "
  }));
  await executar(avaliar, {
    usuario: { uid: "cliente-2", tipo: "cliente" },
    body: { clinicaUid: "clinica-1", nota: 4 }
  });
  const perfil = bancoFalso.documentos.get("usuarios/clinica-1");

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 201);
  assert.equal(resposta.corpo.id, "cliente-1_clinica-1");
  assert.equal(resposta.corpo.comentario, "Atendimento ótimo.");
  assert.equal(resposta.corpo.editada, false);
  assert.equal(perfil.avaliacoesTotal, 2);
  assert.equal(perfil.avaliacoesSoma, 9);
  assert.equal(perfil.mediaAvaliacoes, 4.5);
});

test("permite uma edição e recalcula a média", async () => {
  prepararClinica();
  await executar(avaliar, requisicaoAvaliacao({ nota: 5 }));
  await executar(avaliar, {
    usuario: { uid: "cliente-2", tipo: "cliente" },
    body: { clinicaUid: "clinica-1", nota: 4 }
  });
  const { resposta, erro } = await executar(avaliar, requisicaoAvaliacao({ nota: 2 }));
  const perfil = bancoFalso.documentos.get("usuarios/clinica-1");

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 200);
  assert.equal(resposta.corpo.nota, 2);
  assert.equal(resposta.corpo.editada, true);
  assert.equal(perfil.avaliacoesTotal, 2);
  assert.equal(perfil.avaliacoesSoma, 6);
  assert.equal(perfil.mediaAvaliacoes, 3);
});

test("rejeita uma segunda edição sem alterar a média", async () => {
  prepararClinica();
  await executar(avaliar, requisicaoAvaliacao({ nota: 5 }));
  await executar(avaliar, requisicaoAvaliacao({ nota: 4 }));
  const { erro } = await executar(avaliar, requisicaoAvaliacao({ nota: 3 }));

  assert.equal(erro.status, 409);
  assert.equal(erro.message, "A avaliação já foi editada uma vez.");
  assert.equal(bancoFalso.documentos.get("usuarios/clinica-1").avaliacoesSoma, 4);
});

test("responde 400 para nota fora da faixa, decimal e comentário longo", async () => {
  prepararClinica();
  for (const clinicaUid of [undefined, "", "   ", 123]) {
    const requisicao = requisicaoAvaliacao();
    requisicao.body.clinicaUid = clinicaUid;
    const { erro } = await executar(avaliar, requisicao);
    assert.equal(erro.status, 400);
  }
  for (const nota of [0, 6, 2.5]) {
    const { erro } = await executar(avaliar, requisicaoAvaliacao({ nota }));
    assert.equal(erro.status, 400);
  }
  const { erro } = await executar(avaliar, requisicaoAvaliacao({ comentario: ` ${"a".repeat(501)} ` }));
  assert.equal(erro.status, 400);
  assert.equal(bancoFalso.documentos.has("avaliacoes/cliente-1_clinica-1"), false);
});

test("somente clientes não administradores podem avaliar", async () => {
  prepararClinica();
  for (const requisicao of [
    requisicaoAvaliacao({ tipo: "clinica" }),
    requisicaoAvaliacao({ tipo: "cliente", administrador: true })
  ]) {
    const { erro } = await executar(avaliar, requisicao);
    assert.equal(erro.status, 403);
  }
  assert.equal(bancoFalso.documentos.has("avaliacoes/cliente-1_clinica-1"), false);
});

test("responde 404 se o perfil não existir ou não for clínica", async () => {
  for (const perfil of [null, { tipo: "cliente", status: "aprovada" }]) {
    prepararClinica(perfil);
    const { erro } = await executar(avaliar, requisicaoAvaliacao());
    assert.equal(erro.status, 404);
  }
});

test("responde 409 se a clínica ainda não estiver aprovada", async () => {
  prepararClinica({ tipo: "clinica", status: "pendente" });
  const { erro } = await executar(avaliar, requisicaoAvaliacao());
  assert.equal(erro.status, 409);
  assert.equal(bancoFalso.documentos.has("avaliacoes/cliente-1_clinica-1"), false);
});

test("lista avaliações com proximoCursor quando há mais resultados", async () => {
  prepararClinica();
  for (const [id, clienteUid, atualizadoEm] of [
    ["avaliacao-1", "cliente-1", 3],
    ["avaliacao-2", "cliente-2", 2],
    ["avaliacao-3", "cliente-3", 1]
  ]) {
    bancoFalso.documentos.set(`avaliacoes/${id}`, {
      clinicaUid: "clinica-1", clienteUid, nota: 4, comentario: "", atualizadoEm
    });
  }
  const requisicao = {
    usuario: { uid: "leitor", tipo: "cliente" },
    query: { clinicaUid: "clinica-1", limite: "2" }
  };
  const { resposta, erro } = await executar(listar, requisicao);

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 200);
  assert.deepEqual(resposta.corpo.avaliacoes.map(avaliacao => avaliacao.id),
    ["avaliacao-1", "avaliacao-2"]);
  assert.equal(resposta.corpo.proximoCursor, "avaliacao-2");
});

test("lista avaliações sem proximoCursor quando não há mais resultados", async () => {
  prepararClinica();
  bancoFalso.documentos.set("avaliacoes/avaliacao-1", {
    clinicaUid: "clinica-1", clienteUid: "cliente-1", nota: 4, comentario: "", atualizadoEm: 1
  });
  const requisicao = {
    usuario: { uid: "leitor", tipo: "clinica" },
    query: { clinicaUid: "clinica-1" }
  };
  const { resposta, erro } = await executar(listar, requisicao);

  assert.equal(erro, undefined);
  assert.equal(resposta.codigo, 200);
  assert.equal(resposta.corpo.avaliacoes.length, 1);
  assert.equal(resposta.corpo.proximoCursor, null);
});

test("responde 400 se a clínica da listagem faltar ou o cursor não existir", async () => {
  prepararClinica();
  const usuario = { uid: "leitor", tipo: "cliente" };
  const semClinica = await executar(listar, { usuario, query: {} });
  assert.equal(semClinica.erro.status, 400);

  const cursorInexistente = await executar(listar, {
    usuario,
    query: { clinicaUid: "clinica-1", cursor: "nao-existe" }
  });
  assert.equal(cursorInexistente.erro.status, 400);
});
