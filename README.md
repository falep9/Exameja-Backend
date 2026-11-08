Novos endpoints para Daniel

### Catálogo TUSS da ANS
`GET /api/exams?q=hemograma&page=1&limit=20`

- `q` ou `termo`: busca por texto (até 120 caracteres).
- `page`: página iniciando em 1; `limit`: 1 a 100, conforme a paginação documentada pelo Open Concept Lab.
- Retorna nomes/códigos padronizados TUSS. A presença no catálogo não confirma disponibilidade de um prestador nem cobertura do plano.
- A resposta é mantida em cache em memória por seis horas.

### Busca integrada de exames

`GET /api/exams/search?q=hemograma&page=1&limit=20`

- `q` (ou `termo`) é obrigatório; `page` inicia em 1 e `limit` aceita 1 a 100. (não pode alterar)
- Sem filtros de período e localização, a resposta traz o catálogo TUSS e `producaoSus: null`.
- Para incluir produção SUS, envie `ano` ou `competencia=AAAAMM` e também `municipio` (código IBGE) ou `cnes`. A busca integrada limita `limit` a 20 para controlar as consultas CNES adicionais; `offset` pagina os registros do SIA/SUS.
- A resposta possui `catalogo`, `producaoSus`, `estabelecimentos` e uma observação sobre a relação entre as fontes. Cada linha SIA/SUS recebe detalhes de estabelecimento somente quando seu código CNES puder ser consultado.
- TUSS e SIA/SUS usam terminologias distintas e não há vínculo automático entre elas nesta integração. Os registros são apresentados em seções separadas; não se deve inferir que uma produção SUS corresponde ao exame TUSS pesquisado.
- Valores aprovados pelo SUS não são preços particulares; o endpoint não estima nem inventa preço de clínica.

### Produção ambulatorial SIA/SUS
`GET /api/exams/sus-production?ano=2025&municipio=3550308&limit=100&offset=0`

- Filtros opcionais: `ano` ou `competencia` (formato `AAAAMM`), `municipio` (código IBGE) e `cnes`.
- `limit`: 1 a 1000; `offset`: deslocamento repassado ao serviço do Ministério.
- Os valores aprovados são dados do SUS; não são preços particulares.

As URLs e o timeout configuram-se por `ANS_TUSS_API_URL`, `MINISTERIO_SAUDE_API_URL` e `EXTERNAL_API_TIMEOUT_MS`.

### Cadastro e autenticação inicial

O Firebase Authentication gerencia senhas, verificação de e-mail e redefinição de senha. A API cria o perfil complementar na coleção `usuarios` do Firestore. Cadastros de clínicas começam com status `pendente`.

`POST /api/auth/register`

Cadastro de cliente:

```json
{
  "tipo": "cliente",
  "email": "cliente@exemplo.com",
  "senha": "senha-com-pelo-menos-8",
  "cpf": "12345678909",
  "telefone": "11999999999"
}
```

Cadastro inicial de clínica:

```json
{
  "tipo": "clinica",
  "email": "responsavel@clinica.com.br",
  "senha": "senha-com-pelo-menos-8",
  "dominioCorporativo": "clinica.com.br",
  "razaoSocial": "Clínica Exemplo Ltda.",
  "nomeFantasia": "Clínica Exemplo",
  "cnpj": "12345678000199",
  "telefone": "1133334444",
  "endereco": "Rua Exemplo, 100, São Paulo - SP",
  "cnes": "1234567"
}
```

O campo `cnes` é opcional. A API verifica formato, dígitos verificadores de CPF/CNPJ e se o e-mail corresponde ao domínio corporativo informado; isso não substitui consulta cadastral oficial, aprovação manual nem comprova vínculo empresarial. A aprovação e os documentos comprobatórios serão tratados em etapa posterior.

O CPF é validado localmente, mas não fica armazenado em texto puro: o cadastro guarda somente um HMAC-SHA256 para permitir futuras verificações de duplicidade. Configure `CPF_HMAC_SECRET` com um segredo aleatório de pelo menos 32 caracteres, mantido fora do repositório. Cadastros de clientes falham de forma fechada se esse segredo não estiver configurado.

O cadastro não retorna links de ação nem senhas. O frontend deve usar o SDK Web do Firebase Authentication para enviar o e-mail de verificação e aplicar a ação concluída pelo usuário; configure os domínios autorizados e templates de e-mail no Firebase. Login e redefinição de senha também são feitos pelo SDK Web. Antes de qualquer operação POST, o frontend busca `GET /api/auth/csrf` com `credentials: "include"` e guarda o `csrfToken` da resposta em memória. Após login recente (até cinco minutos), envia o ID token uma vez em `POST /api/auth/session` no cabeçalho `Authorization: Bearer <idToken>` e o CSRF em `X-CSRF-Token`; a API troca-o por cookie de sessão `HttpOnly` com validade de cinco dias. Nas chamadas seguintes, use `credentials: "include"` e envie `X-CSRF-Token` em cada POST/PUT/PATCH/DELETE. Ative no Firebase Authentication a proteção contra enumeração de e-mails e ajuste cotas contra abuso.

`GET /api/auth/csrf` define um cookie CSRF legível pelo frontend e retorna o token no JSON. Envie esse valor no cabeçalho `X-CSRF-Token` em requisições que alterem dados; a API também confere a origem. `POST /api/auth/logout` valida CSRF e limpa os cookies. `GET /api/users/me` exige cookie de sessão válido e e-mail verificado, e retorna uma lista explícita de campos permitidos apenas ao próprio usuário; clínicas pendentes podem consultar o próprio perfil. A senha nunca é salva no Firestore e o CPF não é devolvido (apenas informa se está cadastrado); CNPJ/endereço da clínica só são retornados ao titular autenticado. Configure `CORS_ORIGINS` com as origens exatas do frontend; a aplicação se recusa a iniciar em produção sem essa configuração. `SESSION_COOKIE_SAME_SITE` aceita `strict`, `lax` ou `none`; use `none` somente com HTTPS quando frontend e API estiverem em sites diferentes.

`PATCH /api/users/me` permite atualizar somente campos editáveis do próprio perfil. Cliente pode atualizar CPF e telefone; clínica pode atualizar nome fantasia, telefone e endereço. O CPF continua guardado como HMAC, e a API impede reutilizar um CPF cadastrado por outra conta. Alterar nome fantasia ou endereço de uma clínica aprovada muda seu status para `pendente`, para exigir nova análise. E-mail, tipo de conta, CNPJ e status não podem ser alterados por essa rota.

### Catálogo e match de convênios

`GET /api/convenios` lista o catálogo ativo. A equipe administra os registros com `POST /api/convenios` (`{ "id": "amil", "nome": "Amil" }`) e `PATCH /api/convenios/:id` (`{ "ativo": false }` ou `{ "nome": "Novo nome" }`). IDs são estáveis, em letras minúsculas, números e hífens. Convênios são desativados, não excluídos, para preservar referências nos perfis.

As rotas de administração exigem uma custom claim `administrador: true` no Firebase Authentication. Um operador autorizado deve atribuí-la pelo Admin SDK (`setCustomUserClaims`) fora da API pública; depois, o administrador precisa autenticar novamente para receber a claim na sessão. Nenhum endpoint permite que um usuário conceda esse privilégio a si mesmo.

Clientes podem selecionar até 10 IDs ativos em `PATCH /api/users/me`, no campo `convenios`. Clínicas só podem informar `conveniosAceitos` depois de aprovadas; a lista também aceita até 10 IDs ativos. A busca `GET /api/clinics/suggestions` exige sessão de cliente e retorna clínicas aprovadas que aceitam ao menos um dos convênios selecionados. A consulta usa `array-contains-any`; se o Firestore solicitar, crie o índice composto indicado na mensagem do Firebase.

O endpoint público de cadastro tem um limite básico por IP em memória, configurável por `AUTH_REGISTRATION_MAX_PER_IP`. Em múltiplas instâncias, use também rate limiting distribuído no gateway/proxy. Para produção web, avalie Firebase App Check com reCAPTCHA e monitore antes de ativar enforcement. O logger HTTP omite rotas `/api/auth`; não inclua tokens nem dados pessoais em logs da aplicação.

