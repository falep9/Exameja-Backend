const { registrar: registrarUsuario } = require("../services/authService");
const { validarCadastro } = require("../validators/authValidator");

async function registrar(requisicao, resposta, proximaFuncao) {
  try {
    const dados = validarCadastro(requisicao.body);
    const resultado = await registrarUsuario(dados);
    return resposta.status(201).json({
      message: "Cadastro criado. Verifique seu e-mail para ativar a conta.",
      usuario: {
        uid: resultado.uid,
        email: resultado.email,
        tipo: resultado.tipo,
        status: resultado.status
      }
    });
  } catch (erro) {
    if (erro.code && erro.code.startsWith("auth/")) {
      return resposta.status(erro.code === "auth/email-already-exists" ? 409 : 400).json({
        message: "Não foi possível criar a conta com os dados informados."
      });
    }
    return proximaFuncao(erro);
  }
}

module.exports = { registrar };
