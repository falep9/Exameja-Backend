const { buscarPerfil, atualizarPerfil, salvarCoordenadasClinica } = require("../repositories/usersRepository");
const conveniosRepository = require("../repositories/conveniosRepository");
const { validarAtualizacaoPerfil } = require("../validators/usersValidator");
const { geocodingEndereco } = require("../services/geocodingService");
const { obterNomeUsuario } = require("../utils/nomeUsuario");

async function obterMeuPerfil(requisicao, resposta, proximaFuncao) {
  try {
    const perfil = await buscarPerfil(requisicao.usuario.uid);
    if (!perfil) return resposta.status(404).json({ message: "Perfil não encontrado." });
    const usuario = {
      uid: perfil.uid,
      id: perfil.uid,
      email: requisicao.usuario.email,
      nome: obterNomeUsuario(perfil),
      tipo: perfil.tipo,
      status: perfil.status,
      emailVerificado: requisicao.usuario.emailVerificado,
      criadoEm: perfil.criadoEm,
      atualizadoEm: perfil.atualizadoEm
    };
    if (perfil.tipo === "cliente") {
      usuario.telefone = perfil.telefone;
      usuario.cpfCadastrado = true;
      usuario.convenios = Array.isArray(perfil.convenios) ? perfil.convenios : [];
    }
    if (perfil.tipo === "clinica") {
      Object.assign(usuario, {
        dominioCorporativo: perfil.dominioCorporativo,
        razaoSocial: perfil.razaoSocial,
        nomeFantasia: perfil.nomeFantasia,
        cnpj: perfil.cnpj,
        cnes: perfil.cnes || null,
        telefone: perfil.telefone,
        endereco: perfil.endereco,
        conveniosAceitos: Array.isArray(perfil.conveniosAceitos) ? perfil.conveniosAceitos : [],
        ...(perfil.status === "rejeitada" ? { motivoRejeicao: perfil.motivoStatus || null } : {}),
        ...(perfil.status === "suspensa" ? { motivoSuspensao: perfil.motivoStatus || null } : {})
      });
    }
    return resposta.status(200).json({ usuario });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

async function atualizarMeuPerfil(requisicao, resposta, proximaFuncao) {
  try {
    const perfilAtual = await buscarPerfil(requisicao.usuario.uid);
    if (!perfilAtual) return resposta.status(404).json({ message: "Perfil não encontrado." });

    const dados = validarAtualizacaoPerfil(requisicao.body, perfilAtual.tipo, perfilAtual.status);
    const idsConvenios = dados.convenios ?? dados.conveniosAceitos;
    if (idsConvenios !== undefined) {
      const encontrados = await conveniosRepository.buscarPorIds(idsConvenios);
      if (encontrados.length !== idsConvenios.length || encontrados.some(convenio => !convenio.ativo)) {
        const erro = new Error("Selecione somente convênios ativos do catálogo.");
        erro.status = 400;
        throw erro;
      }
    }
    const atualizacao = { ...dados };
    const requerReaprovacao = perfilAtual.tipo === "clinica"
      && perfilAtual.status === "aprovada"
      && (Object.hasOwn(dados, "nomeFantasia")
        || Object.hasOwn(dados, "endereco")
        || Object.hasOwn(dados, "telefone"));
    if (requerReaprovacao) atualizacao.status = "pendente";
    const perfilAtualizado = await atualizarPerfil(requisicao.usuario.uid, atualizacao);
    if (!perfilAtualizado) return resposta.status(404).json({ message: "Perfil não encontrado." });

    if (perfilAtual.tipo === "clinica" && dados.endereco && dados.endereco !== perfilAtual.endereco) {
      try {
        const coordenadas = await geocodingEndereco(`${dados.endereco}, Brasil`);
        if (coordenadas.encontrado) {
          await salvarCoordenadasClinica(requisicao.usuario.uid, dados.endereco, coordenadas.latitude, coordenadas.longitude);
        }
      } catch {
        // O perfil já foi salvo; a busca pode tentar geocodificar esse endereço depois.
      }
    }

    return resposta.status(200).json({
      message: requerReaprovacao
        ? "Perfil atualizado; a clínica voltou para análise por causa da alteração cadastral."
        : "Perfil atualizado.",
      usuario: {
        uid: perfilAtualizado.uid,
        email: requisicao.usuario.email,
        nome: obterNomeUsuario(perfilAtualizado),
        tipo: perfilAtualizado.tipo,
        status: perfilAtualizado.status,
        telefone: perfilAtualizado.telefone,
        ...(perfilAtualizado.tipo === "cliente" ? { cpfCadastrado: true } : {
          nomeFantasia: perfilAtualizado.nomeFantasia,
          endereco: perfilAtualizado.endereco
        }),
        ...(perfilAtualizado.tipo === "cliente"
          ? { convenios: perfilAtualizado.convenios || [] }
          : { conveniosAceitos: perfilAtualizado.conveniosAceitos || [] })
      }
    });
  } catch (erro) {
    return proximaFuncao(erro);
  }
}

module.exports = { obterMeuPerfil, atualizarMeuPerfil };
