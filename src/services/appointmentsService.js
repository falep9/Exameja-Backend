const { Timestamp } = require("firebase-admin/firestore");
const { buscarPerfil } = require("../repositories/usersRepository");
const {
  criarAgendamento: salvarAgendamento,
  listarAgendamentos: buscarAgendamentos,
  buscarAgendamento: buscarAgendamentoRepositorio,
  atualizarAgendamento: salvarAtualizacao
} = require("../repositories/appointmentsRepository");

function criarErro(mensagem, status) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function validarDataHora(valor) {
  const formatoIso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  const partes = typeof valor === "string" ? formatoIso.exec(valor) : null;
  if (!partes) throw criarErro("Informe uma data e hora ISO válida no futuro.", 400);

  const [, ano, mes, dia, hora, minuto, segundo] = partes.map(Number);
  const dataCalendario = new Date(Date.UTC(ano, mes - 1, dia));
  if (dataCalendario.getUTCFullYear() !== ano
    || dataCalendario.getUTCMonth() !== mes - 1
    || dataCalendario.getUTCDate() !== dia
    || hora > 23 || minuto > 59 || segundo > 59) {
    throw criarErro("Informe uma data e hora ISO válida no futuro.", 400);
  }

  const data = new Date(valor);
  if (!Number.isFinite(data.getTime()) || data.getTime() <= Date.now()) {
    throw criarErro("Informe uma data e hora ISO válida no futuro.", 400);
  }
  data.setUTCSeconds(0, 0);
  if (data.getTime() <= Date.now()) {
    throw criarErro("O horário do agendamento precisa estar no futuro após o ajuste para o minuto.", 400);
  }
  return data;
}

function validarPaginacao({ limite, cursor }) {
  let limiteValidado = 30;
  if (limite !== undefined) {
    if (typeof limite !== "string" || !/^\d+$/.test(limite)) {
      throw criarErro("O limite deve ser um número inteiro entre 1 e 50.", 400);
    }
    limiteValidado = Number(limite);
    if (!Number.isSafeInteger(limiteValidado) || limiteValidado < 1) {
      throw criarErro("O limite deve ser um número inteiro entre 1 e 50.", 400);
    }
    limiteValidado = Math.min(limiteValidado, 50);
  }

  if (cursor !== undefined
    && (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 128 || cursor.includes("/"))) {
    throw criarErro("Cursor de paginação inválido.", 400);
  }
  return { limite: limiteValidado, cursor };
}

async function criarAgendamento(usuario, corpo = {}) {
  if (usuario.tipo !== "cliente") {
    throw criarErro("Somente clientes podem criar agendamentos.", 403);
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw criarErro("O corpo da requisição deve ser um objeto JSON.", 400);
  }
  const { clinicaUid, nomeExame, codigoExame, dataHora } = corpo;
  if (typeof clinicaUid !== "string" || !clinicaUid.trim()) {
    throw criarErro("Informe um identificador válido para a clínica.", 400);
  }
  if (typeof nomeExame !== "string" || nomeExame.trim().length < 2 || nomeExame.trim().length > 120) {
    throw criarErro("O nome do exame deve conter de 2 a 120 caracteres.", 400);
  }
  if (codigoExame !== undefined
    && (typeof codigoExame !== "string" || codigoExame.length > 40)) {
    throw criarErro("O código do exame deve ser uma string de até 40 caracteres.", 400);
  }
  const dataNormalizada = validarDataHora(dataHora);
  const uidClinica = clinicaUid.trim();
  const perfilClinica = await buscarPerfil(uidClinica);
  if (!perfilClinica || perfilClinica.tipo !== "clinica") {
    throw criarErro("Clínica não encontrada.", 404);
  }
  if (perfilClinica.status !== "aprovada") {
    throw criarErro("A clínica ainda não foi aprovada.", 409);
  }

  return salvarAgendamento({
    clienteUid: usuario.uid,
    clinicaUid: uidClinica,
    nomeExame: nomeExame.trim(),
    ...(codigoExame !== undefined ? { codigoExame: codigoExame.trim() } : {}),
    dataHora: Timestamp.fromDate(dataNormalizada),
    // O identificador é calculado sem consultar ou criar uma conversa.
    conversaId: `${usuario.uid}_${uidClinica}`
  });
}

async function listarAgendamentos(usuario, paginacao) {
  if (usuario.administrador === true || !["cliente", "clinica"].includes(usuario.tipo)) {
    throw criarErro("Administradores não podem listar agendamentos.", 403);
  }
  const parametros = validarPaginacao(paginacao);
  return buscarAgendamentos({
    campoUsuario: usuario.tipo === "cliente" ? "clienteUid" : "clinicaUid",
    usuarioUid: usuario.uid,
    ...parametros
  });
}

async function buscarAgendamento(usuario, id) {
  const agendamento = await buscarAgendamentoRepositorio(id);
  if (!agendamento) throw criarErro("Agendamento não encontrado.", 404);
  if (usuario.administrador !== true
    && usuario.uid !== agendamento.clienteUid
    && usuario.uid !== agendamento.clinicaUid) {
    throw criarErro("Somente participantes ou administradores podem acessar o agendamento.", 403);
  }
  return agendamento;
}

function validarAcao(corpo = {}) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw criarErro("O corpo da requisição deve ser um objeto JSON.", 400);
  }
  const { acao, motivo } = corpo;
  if (!["confirmar", "recusar", "cancelar", "concluir"].includes(acao)) {
    throw criarErro("Ação inválida.", 400);
  }
  if (motivo !== undefined && (typeof motivo !== "string" || motivo.trim().length > 300)) {
    throw criarErro("O motivo deve conter até 300 caracteres.", 400);
  }
  if (acao === "recusar" && (typeof motivo !== "string" || motivo.trim().length < 3)) {
    throw criarErro("Informe um motivo de 3 a 300 caracteres para recusar.", 400);
  }
  return { acao, motivo: motivo === undefined ? undefined : motivo.trim() };
}

async function atualizarAgendamento(usuario, id, corpo) {
  const { acao, motivo } = validarAcao(corpo);
  if (acao === "concluir" && usuario.tipo !== "clinica") {
    throw criarErro("Somente clínicas podem concluir agendamentos.", 403);
  }
  return salvarAtualizacao({ usuario, id, acao, motivo });
}

module.exports = {
  criarAgendamento,
  listarAgendamentos,
  buscarAgendamento,
  atualizarAgendamento
};
