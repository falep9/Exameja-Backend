function obterNomeUsuario(perfil) {
  if (perfil?.tipo === "cliente") return perfil.nome || "Paciente";
  if (perfil?.tipo === "clinica") return perfil.nomeFantasia || "Clínica";
  return "Usuário";
}

module.exports = { obterNomeUsuario };
