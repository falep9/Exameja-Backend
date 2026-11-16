const { createHash } = require("node:crypto");
const { FieldValue, FieldPath } = require("firebase-admin/firestore");
const { obterBancoFirestore } = require("../config/firebase");

const COLECAO = "ofertas_exames";
const COLECAO_HISTORICO = "historico_ofertas_exames";

function criarIdOferta(uidClinica, codigoExame) {
  return createHash("sha256").update(`${uidClinica}\0${codigoExame}`).digest("hex");
}

async function salvarOferta(uidClinica, codigoExame, dados) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO).doc(criarIdOferta(uidClinica, codigoExame));
  const referenciaHistorico = banco.collection(COLECAO_HISTORICO).doc();
  await banco.runTransaction(async transacao => {
    const atual = await transacao.get(referencia);
    const oferta = {
      uidClinica,
      codigoExame,
      nomeExame: dados.nomeExame,
      preco: dados.preco,
      moeda: "BRL",
      ativa: true,
      ...(dados.referenciaSus ? { referenciaSus: dados.referenciaSus } : {}),
      criadoEm: atual.exists ? atual.get("criadoEm") : FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp()
    };
    const anterior = atual.exists ? atual.data() : null;
    const mudouOferta = !anterior || anterior.ativa !== true
      || anterior.nomeExame !== oferta.nomeExame || anterior.preco !== oferta.preco
      || JSON.stringify(anterior.referenciaSus || null) !== JSON.stringify(oferta.referenciaSus || null);
    transacao.set(referencia, oferta);
    if (mudouOferta) {
      transacao.create(referenciaHistorico, {
        uidClinica,
        atorUid: uidClinica,
        codigoExame,
        acao: !anterior ? "criada" : anterior.ativa === false ? "reativada" : "atualizada",
        ofertaAnterior: anterior ? resumirOferta(anterior) : null,
        ofertaNova: resumirOferta(oferta),
        registradoEm: FieldValue.serverTimestamp()
      });
    }
  });
  const atualizado = await referencia.get();
  return { id: atualizado.id, ...atualizado.data() };
}

async function desativarOferta(uidClinica, codigoExame) {
  const banco = obterBancoFirestore();
  const referencia = banco.collection(COLECAO).doc(criarIdOferta(uidClinica, codigoExame));
  const referenciaHistorico = banco.collection(COLECAO_HISTORICO).doc();
  return banco.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (!documento.exists || documento.get("uidClinica") !== uidClinica || documento.get("ativa") !== true) return false;
    const ofertaAnterior = documento.data();
    transacao.update(referencia, { ativa: false, atualizadoEm: FieldValue.serverTimestamp() });
    transacao.create(referenciaHistorico, {
      uidClinica,
      atorUid: uidClinica,
      codigoExame,
      acao: "desativada",
      ofertaAnterior: resumirOferta(ofertaAnterior),
      ofertaNova: { ...resumirOferta(ofertaAnterior), ativa: false },
      registradoEm: FieldValue.serverTimestamp()
    });
    return true;
  });
}

function resumirOferta(oferta) {
  return {
    nomeExame: oferta.nomeExame,
    preco: oferta.preco,
    moeda: oferta.moeda || "BRL",
    ativa: oferta.ativa === true,
    ...(oferta.referenciaSus ? { referenciaSus: oferta.referenciaSus } : {})
  };
}

async function listarHistoricoOferta(uidClinica, codigoExame, { limite = 20, cursor } = {}) {
  const banco = obterBancoFirestore();
  const colecao = banco.collection(COLECAO_HISTORICO);
  let consulta = colecao.where("uidClinica", "==", uidClinica)
    .where("codigoExame", "==", codigoExame)
    .orderBy("registradoEm", "desc");
  if (cursor) {
    const documentoCursor = await colecao.doc(cursor).get();
    if (!documentoCursor.exists || documentoCursor.get("uidClinica") !== uidClinica
      || documentoCursor.get("codigoExame") !== codigoExame) {
      const erro = new Error("Cursor de histórico inválido.");
      erro.status = 400;
      throw erro;
    }
    consulta = consulta.startAfter(documentoCursor);
  }
  const snapshot = await consulta.limit(limite + 1).get();
  const temMais = snapshot.docs.length > limite;
  const documentos = snapshot.docs.slice(0, limite);
  return {
    historico: documentos.map(documento => ({ id: documento.id, ...documento.data() })),
    proximoCursor: temMais ? documentos[documentos.length - 1].id : null
  };
}

async function listarOfertasClinica(uidClinica) {
  const snapshot = await obterBancoFirestore().collection(COLECAO)
    .where("uidClinica", "==", uidClinica)
    .get();
  return snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }))
    .filter(oferta => oferta.ativa === true);
}

async function listarOfertasPorCodigos(codigosExame, { limite = 500 } = {}) {
  const codigos = [...new Set(codigosExame)].slice(0, 20);
  if (!codigos.length) return [];
  const banco = obterBancoFirestore();
  const ofertas = new Map();
  // Percorre páginas até o fim para não omitir clínicas quando um exame tiver mais
  // de 500 ofertas. Mantém as consultas por código isoladas para não depender de
  // limites de `in` do Firestore.
  await Promise.all(codigos.map(async codigo => {
    let consulta = banco.collection(COLECAO).where("codigoExame", "==", codigo).orderBy(FieldPath.documentId());
    let ultimaPagina = null;
    while (true) {
      const pagina = await (ultimaPagina ? consulta.startAfter(ultimaPagina) : consulta).limit(limite).get();
      for (const documento of pagina.docs) {
        const oferta = documento.data();
        if (oferta.ativa === true) ofertas.set(documento.id, { id: documento.id, ...oferta });
      }
      if (pagina.size < limite) break;
      ultimaPagina = pagina.docs[pagina.docs.length - 1];
    }
  }));
  return [...ofertas.values()];
}

async function buscarClinicasPorIds(ids) {
  const idsUnicos = [...new Set(ids)].filter(Boolean);
  if (!idsUnicos.length) return [];
  const banco = obterBancoFirestore();
  const documentos = [];
  const tamanhoLote = 200;
  const concorrencia = 4;
  for (let indice = 0; indice < idsUnicos.length; indice += tamanhoLote * concorrencia) {
    const grupos = Array.from({ length: concorrencia }, (_, grupo) =>
      idsUnicos.slice(indice + grupo * tamanhoLote, indice + (grupo + 1) * tamanhoLote)
    ).filter(grupo => grupo.length);
    const respostas = await Promise.all(grupos.map(grupo => banco.getAll(
      ...grupo.map(id => banco.collection("usuarios").doc(id))
    )));
    documentos.push(...respostas.flat());
  }
  return documentos.filter(documento => documento.exists)
    .map(documento => ({ uid: documento.id, ...documento.data() }))
    .filter(perfil => perfil.tipo === "clinica" && perfil.status === "aprovada");
}

module.exports = {
  salvarOferta,
  desativarOferta,
  listarHistoricoOferta,
  listarOfertasClinica,
  listarOfertasPorCodigos,
  buscarClinicasPorIds
};
