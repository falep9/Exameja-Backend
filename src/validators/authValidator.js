const TIPOS_USUARIO = Object.freeze({ CLIENTE: "cliente", CLINICA: "clinica" });

function validarCorpo(corpo, camposPermitidos) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    const erro = new Error("O corpo da requisição deve ser um objeto JSON.");
    erro.status = 400;
    throw erro;
  }
  const campoDesconhecido = Object.keys(corpo).find(campo => !camposPermitidos.includes(campo));
  if (campoDesconhecido) {
    const erro = new Error(`O campo '${campoDesconhecido}' não é permitido.`);
    erro.status = 400;
    throw erro;
  }
}

function textoObrigatorio(valor, campo, limite) {
  if (typeof valor !== "string" || !valor.trim() || valor.trim().length > limite) {
    const erro = new Error(`O campo '${campo}' é obrigatório e deve ter até ${limite} caracteres.`);
    erro.status = 400;
    throw erro;
  }
  return valor.trim();
}

function validarEmail(valor) {
  const email = textoObrigatorio(valor, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const erro = new Error("Informe um endereço de e-mail válido.");
    erro.status = 400;
    throw erro;
  }
  return email;
}

function validarSenha(valor) {
  if (typeof valor !== "string" || valor.length < 8 || valor.length > 128) {
    const erro = new Error("A senha deve ter entre 8 e 128 caracteres.");
    erro.status = 400;
    throw erro;
  }
  return valor;
}

function validarDocumento(valor, campo, tamanho) {
  const documento = textoObrigatorio(valor, campo, tamanho + 20).replace(/\D/g, "");
  const pesos = tamanho === 11
    ? [[10, 9, 8, 7, 6, 5, 4, 3, 2], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]]
    : [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]];
  const calcularDigito = (base, multiplicadores) => {
    const resto = [...base].reduce((soma, digito, indice) => soma + Number(digito) * multiplicadores[indice], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const formatoValido = documento.length === tamanho
    && new Set(documento).size !== 1
    && calcularDigito(documento.slice(0, tamanho - 2), pesos[0]) === Number(documento[tamanho - 2])
    && calcularDigito(documento.slice(0, tamanho - 1), pesos[1]) === Number(documento[tamanho - 1]);
  if (!formatoValido) {
    const erro = new Error(`Informe um ${campo} com formato e dígitos verificadores válidos.`);
    erro.status = 400;
    throw erro;
  }
  return documento;
}

function validarTelefone(valor) {
  const telefone = textoObrigatorio(valor, "telefone", 30);
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) {
    const erro = new Error("Informe um telefone válido com DDD.");
    erro.status = 400;
    throw erro;
  }
  return telefone;
}

function validarDominioCorporativo(email, dominio) {
  const dominioInformado = textoObrigatorio(dominio, "dominioCorporativo", 253)
    .toLowerCase().replace(/^@/, "");
  const dominioEmail = email.split("@")[1];
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(dominioInformado)
    || dominioEmail !== dominioInformado
    || ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com"].includes(dominioInformado)) {
    const erro = new Error("O e-mail deve pertencer ao domínio corporativo informado.");
    erro.status = 400;
    throw erro;
  }
  return dominioInformado;
}

function validarCadastro(dados) {
  const tipo = dados?.tipo;
  if (tipo === TIPOS_USUARIO.CLIENTE) {
    validarCorpo(dados, ["tipo", "email", "senha", "cpf", "telefone"]);
    return {
      tipo,
      email: validarEmail(dados.email),
      senha: validarSenha(dados.senha),
      cpf: validarDocumento(dados.cpf, "CPF", 11),
      telefone: validarTelefone(dados.telefone)
    };
  }
  if (tipo === TIPOS_USUARIO.CLINICA) {
    validarCorpo(dados, ["tipo", "email", "senha", "dominioCorporativo", "razaoSocial", "nomeFantasia", "cnpj", "cnes", "telefone", "endereco"]);
    const email = validarEmail(dados.email);
    const cadastro = {
      tipo,
      email,
      senha: validarSenha(dados.senha),
      dominioCorporativo: validarDominioCorporativo(email, dados.dominioCorporativo),
      razaoSocial: textoObrigatorio(dados.razaoSocial, "razaoSocial", 200),
      nomeFantasia: textoObrigatorio(dados.nomeFantasia, "nomeFantasia", 200),
      cnpj: validarDocumento(dados.cnpj, "CNPJ", 14),
      telefone: validarTelefone(dados.telefone),
      endereco: textoObrigatorio(dados.endereco, "endereco", 500)
    };
    if (dados.cnes !== undefined && dados.cnes !== "") {
      if (typeof dados.cnes !== "string") {
        const erro = new Error("O campo 'cnes' deve ser texto.");
        erro.status = 400;
        throw erro;
      }
      cadastro.cnes = textoObrigatorio(dados.cnes, "cnes", 10);
      if (!/^\d{1,10}$/.test(cadastro.cnes)) {
        const erro = new Error("O CNES deve conter somente dígitos.");
        erro.status = 400;
        throw erro;
      }
    }
    return cadastro;
  }
  const erro = new Error("O campo 'tipo' deve ser 'cliente' ou 'clinica'.");
  erro.status = 400;
  throw erro;
}

module.exports = { TIPOS_USUARIO, validarCadastro, validarEmail };
