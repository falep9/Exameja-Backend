const { test, after } = require("node:test");
const assert = require("node:assert/strict");

class SnapshotFalso {
  constructor(id, dados) {
    this.id = id;
    this.ref = { id };
    this._dados = dados;
    this.exists = Boolean(dados);
  }

  data() { return this._dados && { ...this._dados }; }
  get(campo) { return this._dados?.[campo]; }
}

class ReferenciaFalsa {
  constructor(banco, colecao, id) {
    this.banco = banco;
    this.colecao = colecao;
    this.id = id;
  }

  chave() { return `${this.colecao}/${this.id}`; }
  async get() { return new SnapshotFalso(this.id, this.banco.documentos.get(this.chave())); }
  async create(dados) {
    if (this.banco.documentos.has(this.chave())) throw new Error("Documento duplicado");
    this.banco.documentos.set(this.chave(), { ...dados });
  }
  async update(dados) {
    const existente = this.banco.documentos.get(this.chave());
    if (!existente) throw new Error("Documento ausente");
    this.banco.documentos.set(this.chave(), { ...existente, ...dados });
  }
}

class ConsultaFalsa {
  constructor(banco, colecao) {
    this.banco = banco;
    this.colecao = colecao;
    this.filtros = [];
    this.maximo = Infinity;
  }
  where(campo, operador, valor) {
    assert.ok(["==", "array-contains-any"].includes(operador));
    this.filtros.push([campo, operador, valor]);
    return this;
  }
  orderBy() { return this; }
  limit(valor) { this.maximo = valor; return this; }
  startAfter() { return this; }
  async get() {
    const prefixo = `${this.colecao}/`;
    const docs = [...this.banco.documentos.entries()]
      .filter(([chave]) => chave.startsWith(prefixo))
      .map(([chave, dados]) => new SnapshotFalso(chave.slice(prefixo.length), dados))
      .filter(documento => this.filtros.every(([campo, operador, valor]) => {
        if (operador === "==") return documento.get(campo) === valor;
        const itens = documento.get(campo);
        return Array.isArray(itens) && itens.some(item => valor.includes(item));
      }))
      .slice(0, this.maximo);
    return { docs, empty: docs.length === 0 };
  }
}

class BancoFalso {
  constructor() {
    this.documentos = new Map();
    this.proximoId = 1;
  }
  collection(nome) {
    return {
      doc: id => new ReferenciaFalsa(this, nome, id || `auto-${this.proximoId++}`),
      where: (...args) => new ConsultaFalsa(this, nome).where(...args)
    };
  }
  async runTransaction(callback) {
    const operacoes = [];
    const transacao = {
      get: referencia => referencia.get(),
      create: (referencia, dados) => operacoes.push(["create", referencia, dados]),
      update: (referencia, dados) => operacoes.push(["update", referencia, dados]),
      delete: referencia => operacoes.push(["delete", referencia])
    };
    const resultado = await callback(transacao);
    for (const [acao, referencia, dados] of operacoes) {
      if (acao === "create") await referencia.create(dados);
      if (acao === "update") await referencia.update(dados);
      if (acao === "delete") this.documentos.delete(referencia.chave());
    }
    return resultado;
  }
}

const bancoFalso = new BancoFalso();
const configFirebase = require("../src/config/firebase");
const obterBancoOriginal = configFirebase.obterBancoFirestore;
configFirebase.obterBancoFirestore = () => bancoFalso;
const repositorio = require("../src/repositories/usersRepository");
const conveniosRepository = require("../src/repositories/conveniosRepository");

after(() => {
  configFirebase.obterBancoFirestore = obterBancoOriginal;
});

test("registra rejeição e notificação com motivo sem expor a notificação a outra conta", async () => {
  bancoFalso.documentos.set("usuarios/clinica-1", {
    uid: "clinica-1",
    tipo: "clinica",
    status: "pendente",
    criadoEm: 1
  });

  const resultado = await repositorio.decidirStatusClinica({
    uid: "clinica-1",
    acao: "rejeitar",
    atorUid: "admin-1",
    motivo: "CNPJ não corresponde ao cadastro informado."
  });

  assert.deepEqual(resultado, { uid: "clinica-1", status: "rejeitada" });
  assert.equal(bancoFalso.documentos.get("usuarios/clinica-1").motivoStatus,
    "CNPJ não corresponde ao cadastro informado.");
  assert.equal(bancoFalso.documentos.get("auditoria_clinicas/auto-1").atorUid, "admin-1");

  const lista = await repositorio.listarNotificacoes("clinica-1");
  assert.equal(lista.notificacoes.length, 1);
  assert.equal(lista.notificacoes[0].motivo, "CNPJ não corresponde ao cadastro informado.");
  assert.equal(lista.notificacoes[0].lida, false);
  assert.equal(await repositorio.marcarNotificacaoComoLida("outra-clinica", lista.notificacoes[0].id), false);
  assert.equal(await repositorio.marcarNotificacaoComoLida("clinica-1", lista.notificacoes[0].id), true);
  assert.equal(bancoFalso.documentos.get(`notificacoes/${lista.notificacoes[0].id}`).lida, true);
});

test("busca de clínicas retorna somente contas aprovadas", async () => {
  bancoFalso.documentos.set("usuarios/clinica-aprovada", {
    uid: "clinica-aprovada", tipo: "clinica", status: "aprovada", conveniosAceitos: ["amil"]
  });
  bancoFalso.documentos.set("usuarios/clinica-rejeitada", {
    uid: "clinica-rejeitada", tipo: "clinica", status: "rejeitada", conveniosAceitos: ["amil"]
  });
  bancoFalso.documentos.set("usuarios/clinica-pendente", {
    uid: "clinica-pendente", tipo: "clinica", status: "pendente", conveniosAceitos: ["amil"]
  });

  const clinicas = await conveniosRepository.listarClinicasPorConvenios(["amil"]);
  assert.deepEqual(clinicas.map(clinica => clinica.uid), ["clinica-aprovada"]);
});
