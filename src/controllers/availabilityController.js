const { Timestamp } = require("firebase-admin/firestore");
const repository = require("../repositories/availabilityRepository");
const { buscarPerfil } = require("../repositories/usersRepository");

function erro(mensagem, status = 400) {
  const resultado = new Error(mensagem);
  resultado.status = status;
  return resultado;
}

function validarInstante(valor, futuro = false) {
  if (typeof valor !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(valor)) {
    throw erro("Informe data e hora em formato ISO 8601.");
  }
  const [, ano, mes, dia, hora, minuto, segundo] = /^([\d]{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(valor).map(Number);
  const calendario = new Date(Date.UTC(ano, mes - 1, dia));
  if (calendario.getUTCFullYear() !== ano || calendario.getUTCMonth() !== mes - 1
    || calendario.getUTCDate() !== dia || hora > 23 || minuto > 59 || segundo > 59) {
    throw erro("Informe data e hora em formato ISO 8601.");
  }
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime()) || (futuro && data.getTime() <= Date.now())) throw erro("O horário deve estar no futuro.");
  if (data.getUTCSeconds() || data.getUTCMilliseconds()) throw erro("Os horários devem começar em um minuto exato.");
  return Timestamp.fromDate(data);
}

function paginacao(query) {
  const limite = query.limite === undefined ? 50 : Number(query.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw erro("O limite deve ser um inteiro entre 1 e 100.");
  const cursor = query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !/^[a-f\d]{64}$/.test(cursor))) throw erro("Cursor de paginação inválido.");
  return { limite, cursor };
}

async function publicar(req, res, next) {
  try {
    if (req.usuario.tipo !== "clinica") throw erro("Somente clínicas podem publicar horários.", 403);
    if (!Array.isArray(req.body?.horarios) || req.body.horarios.length < 1 || req.body.horarios.length > 100) throw erro("Informe de 1 a 100 horários.");
    const horarios = req.body.horarios.map(valor => validarInstante(valor, true));
    if (new Set(horarios.map(item => item.toDate().toISOString())).size !== horarios.length) throw erro("A lista contém horários duplicados.");
    const perfil = await buscarPerfil(req.usuario.uid);
    if (!perfil || perfil.tipo !== "clinica" || perfil.status !== "aprovada") throw erro("Clínica não encontrada ou não aprovada.", 403);
    return res.status(201).json(await repository.publicarHorarios(req.usuario.uid, horarios));
  } catch (e) { return next(e); }
}

async function remover(req, res, next) {
  try {
    if (req.usuario.tipo !== "clinica") throw erro("Somente clínicas podem remover horários.", 403);
    const perfil = await buscarPerfil(req.usuario.uid);
    if (!perfil || perfil.tipo !== "clinica" || perfil.status !== "aprovada") throw erro("Clínica não encontrada ou não aprovada.", 403);
    await repository.removerHorario(req.usuario.uid, validarInstante(req.params.dataHora));
    return res.status(204).end();
  } catch (e) { return next(e); }
}

async function listar(req, res, next) {
  try {
    const { inicio, fim } = req.query;
    const inicioDate = validarInstante(inicio);
    const fimDate = validarInstante(fim);
    if (fimDate.toMillis() <= inicioDate.toMillis() || fimDate.toMillis() - inicioDate.toMillis() > 31 * 86400000 || inicioDate.toMillis() < Date.now()) throw erro("Informe um intervalo futuro de até 31 dias.");
    const perfil = await buscarPerfil(req.params.uid);
    if (!perfil || perfil.tipo !== "clinica" || perfil.status !== "aprovada") throw erro("Clínica não encontrada.", 404);
    res.set("Cache-Control", "no-store");
    return res.status(200).json(await repository.listarHorarios(req.params.uid, { inicio: inicioDate.toDate(), fim: fimDate.toDate(), ...paginacao(req.query) }));
  } catch (e) { return next(e); }
}

module.exports = { publicar, remover, listar };
