const { buscarExamePorCodigo } = require("./examsService");
const { listarAtivos } = require("../repositories/conveniosRepository");
const ofertasRepository = require("../repositories/examOffersRepository");
const { geocodingEndereco } = require("./geocodingService");
const examesRepository = require("../repositories/examsRepository");

function validarCoordenadas(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function calcularDistanciaKm(a, b) {
  const radianos = graus => graus * Math.PI / 180;
  const diferencaLatitude = radianos(b.latitude - a.latitude);
  const diferencaLongitude = radianos(b.longitude - a.longitude);
  const termoSemLimite = Math.sin(diferencaLatitude / 2) ** 2
    + Math.cos(radianos(a.latitude)) * Math.cos(radianos(b.latitude))
      * Math.sin(diferencaLongitude / 2) ** 2;
  const termo = Math.min(1, Math.max(0, termoSemLimite));
  return 6371 * 2 * Math.atan2(Math.sqrt(termo), Math.sqrt(1 - termo));
}

async function obterCodigosExame(codigoExame) {
  let exame;
  try {
    exame = await buscarExamePorCodigo(codigoExame);
  } catch (falhaCatalogo) {
    try {
      const [catalogado] = await examesRepository.buscarExamesCatalogados([codigoExame]);
      if (catalogado) exame = { codigo: catalogado.codigo, nome: catalogado.nome, tabela: catalogado.tabela || "TUSS" };
      else throw falhaCatalogo;
    } catch (falhaBanco) {
      if (falhaBanco === falhaCatalogo) throw falhaCatalogo;
      throw falhaBanco;
    }
  }
  if (!exame) {
    const erro = new Error("O código do exame não foi encontrado no catálogo TUSS.");
    erro.status = 404;
    throw erro;
  }
  return { exames: [exame], codigos: [exame.codigo] };
}

async function obterLocalizacao({ latitude, longitude, endereco }) {
  if (endereco) {
    const resultado = await geocodingEndereco(endereco);
    if (!resultado.encontrado) {
      const erro = new Error("Não foi possível localizar o endereço informado.");
      erro.status = 422;
      throw erro;
    }
    return { latitude: resultado.latitude, longitude: resultado.longitude, endereco: resultado.enderecoFormatado };
  }
  return { latitude, longitude, endereco: null };
}

function obterCoordenadasClinica(clinica) {
  if (clinica.enderecoCoordenadas !== clinica.endereco
    || !validarCoordenadas(clinica.latitude, clinica.longitude)) return null;
  return { latitude: clinica.latitude, longitude: clinica.longitude };
}

function estaNaCaixaDeBusca(origem, destino, raioKm) {
  // A caixa é um filtro rápido e conservador; Haversine decide o raio exato.
  const grausLatitude = raioKm / 110;
  if (Math.abs(destino.latitude - origem.latitude) > grausLatitude) return false;
  const cossenoLatitude = Math.abs(Math.cos(origem.latitude * Math.PI / 180));
  if (cossenoLatitude < 1e-8) return true;
  const grausLongitude = Math.min(180, raioKm / (110 * cossenoLatitude));
  const diferencaLongitude = Math.abs(((destino.longitude - origem.longitude + 540) % 360) - 180);
  return diferencaLongitude <= grausLongitude;
}

async function buscarClinicas({
  codigoExame,
  latitude,
  longitude,
  endereco,
  raioKm = 10,
  convenioId,
  precoMinimo,
  precoMaximo,
  ordenar = "distancia",
  limite = 20,
  deslocamento = 0
}) {
  const [selecaoExame, localizacao] = await Promise.all([
    obterCodigosExame(codigoExame),
    obterLocalizacao({ latitude, longitude, endereco })
  ]);
  if (!selecaoExame.codigos.length) {
    return { exames: selecaoExame.exames, resultados: [], total: 0, limit: limite, offset: deslocamento };
  }

  const ofertas = await ofertasRepository.listarOfertasPorCodigos(selecaoExame.codigos);
  if (!ofertas.length) {
    return { exames: selecaoExame.exames, localizacao, resultados: [], total: 0, clinicasSemCoordenadas: 0, limit: limite, offset: deslocamento };
  }
  const uidClinicas = ofertas.map(oferta => oferta.uidClinica);
  const clinicas = await ofertasRepository.buscarClinicasPorIds(uidClinicas);
  const clinicasPorUid = new Map(clinicas.map(clinica => [clinica.uid, clinica]));
  const ofertasAplicaveis = ofertas.filter(oferta => {
    const clinica = clinicasPorUid.get(oferta.uidClinica);
    return clinica
      && Number.isFinite(oferta.preco)
      && oferta.preco > 0
      && (!convenioId || (Array.isArray(clinica.conveniosAceitos) && clinica.conveniosAceitos.includes(convenioId)))
      && (precoMinimo === undefined || oferta.preco >= precoMinimo)
      && (precoMaximo === undefined || oferta.preco <= precoMaximo);
  });
  if (!ofertasAplicaveis.length) {
    return { exames: selecaoExame.exames, localizacao, resultados: [], total: 0, clinicasSemCoordenadas: 0, limit: limite, offset: deslocamento };
  }
  const [perfisComCoordenadas, catalogoConvenios] = await Promise.all([
    [...new Set(ofertasAplicaveis.map(oferta => oferta.uidClinica))].map(uid => {
      const clinica = clinicasPorUid.get(uid);
      return { uid, clinica, coordenadas: obterCoordenadasClinica(clinica) };
    }),
    listarAtivos()
  ]);
  const clinicasGeo = new Map(perfisComCoordenadas.map(item => [item.uid, item]));
  const conveniosPorId = new Map(catalogoConvenios.filter(convenio => convenio.ativo).map(convenio => [convenio.id, convenio]));
  const examePorCodigo = new Map(selecaoExame.exames.map(exame => [exame.codigo, exame]));
  const resultados = [];

  for (const oferta of ofertasAplicaveis) {
    const dadosClinica = clinicasGeo.get(oferta.uidClinica);
    if (!dadosClinica?.coordenadas) continue;
    if (!estaNaCaixaDeBusca(localizacao, dadosClinica.coordenadas, raioKm)) continue;
    const distancia = calcularDistanciaKm(localizacao, dadosClinica.coordenadas);
    if (distancia > raioKm) continue;
    const conveniosAceitos = (dadosClinica.clinica.conveniosAceitos || [])
      .map(id => conveniosPorId.get(id))
      .filter(Boolean)
      .map(({ id, nome }) => ({ id, nome }));
    const exame = examePorCodigo.get(oferta.codigoExame);
    resultados.push({
      clinica: {
        uid: dadosClinica.uid,
        nomeFantasia: dadosClinica.clinica.nomeFantasia,
        endereco: dadosClinica.clinica.endereco,
        telefone: dadosClinica.clinica.telefone,
        avaliacaoMedia: Number.isFinite(dadosClinica.clinica.avaliacaoMedia) ? dadosClinica.clinica.avaliacaoMedia : 0,
        quantidadeAvaliacoes: Number.isSafeInteger(dadosClinica.clinica.quantidadeAvaliacoes) ? dadosClinica.clinica.quantidadeAvaliacoes : 0,
        latitude: dadosClinica.coordenadas.latitude,
        longitude: dadosClinica.coordenadas.longitude,
        distanciaKm: Number(distancia.toFixed(2)),
        conveniosAceitos
      },
      exame: {
        codigo: oferta.codigoExame,
        nome: exame?.nome || oferta.nomeExame,
        tabela: exame?.tabela || "TUSS"
      },
      preco: { valor: oferta.preco, moeda: oferta.moeda || "BRL" }
    });
  }

  resultados.sort((a, b) => ordenar === "preco"
    ? a.preco.valor - b.preco.valor || a.clinica.distanciaKm - b.clinica.distanciaKm
    : a.clinica.distanciaKm - b.clinica.distanciaKm || a.preco.valor - b.preco.valor);
  return {
    exames: selecaoExame.exames,
    localizacao,
    resultados: resultados.slice(deslocamento, deslocamento + limite),
    total: resultados.length,
    clinicasSemCoordenadas: perfisComCoordenadas.filter(item => !item.coordenadas).length,
    limit: limite,
    offset: deslocamento
  };
}

module.exports = { buscarClinicas, calcularDistanciaKm, estaNaCaixaDeBusca, obterCoordenadasClinica };
