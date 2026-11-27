const usersRepository = require("../repositories/usersRepository");
const conveniosRepository = require("../repositories/conveniosRepository");
const { calcularDistanciaKm, obterCoordenadasClinica } = require("./clinicSearchService");

const CENTRO_PADRAO = Object.freeze({ latitude: -1.4558, longitude: -48.4902, nome: "Belém, PA" });
const RAIO_PADRAO_KM = 30;

async function listarClinicasNoMapa({ latitude, longitude, raioKm = RAIO_PADRAO_KM, convenioId } = {}) {
  const centro = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude, nome: null }
    : CENTRO_PADRAO;
  const [clinicas, convenios] = await Promise.all([
    usersRepository.listarClinicasAprovadas(),
    conveniosRepository.listarAtivos()
  ]);
  const conveniosPorId = new Map(convenios.filter(convenio => convenio.ativo).map(convenio => [convenio.id, convenio]));

  let semCoordenadas = 0;
  const resultado = [];
  for (const clinica of clinicas) {
    const aceitos = Array.isArray(clinica.conveniosAceitos) ? clinica.conveniosAceitos : [];
    if (convenioId && !aceitos.includes(convenioId)) continue;
    const coordenadas = obterCoordenadasClinica(clinica);
    if (!coordenadas) {
      semCoordenadas += 1;
      continue;
    }
    const distanciaKm = calcularDistanciaKm(centro, coordenadas);
    if (distanciaKm > raioKm) continue;
    resultado.push({
      uid: clinica.uid,
      nomeFantasia: clinica.nomeFantasia,
      endereco: clinica.endereco,
      telefone: clinica.telefone,
      latitude: coordenadas.latitude,
      longitude: coordenadas.longitude,
      distanciaKm: Number(distanciaKm.toFixed(2)),
      avaliacaoMedia: Number.isFinite(clinica.avaliacaoMedia) ? clinica.avaliacaoMedia : 0,
      quantidadeAvaliacoes: Number.isSafeInteger(clinica.quantidadeAvaliacoes) ? clinica.quantidadeAvaliacoes : 0,
      conveniosAceitos: aceitos.map(id => conveniosPorId.get(id)).filter(Boolean).map(({ id, nome }) => ({ id, nome }))
    });
  }
  resultado.sort((a, b) => a.distanciaKm - b.distanciaKm);
  return { centro, raioKm, clinicas: resultado, total: resultado.length, clinicasSemCoordenadas: semCoordenadas };
}

module.exports = { listarClinicasNoMapa, CENTRO_PADRAO, RAIO_PADRAO_KM };
