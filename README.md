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

O campo `cnes` é opcional. A API verifica formato, quantidade de dígitos e se o e-mail corresponde ao domínio corporativo informado; isso não substitui a aprovação manual nem comprova vínculo empresarial. CPF/CNPJ recebem validação básica de formato, não consulta cadastral oficial. A aprovação e os documentos comprobatórios serão tratados em etapa posterior.

O CPF é validado localmente, mas não fica armazenado em texto puro: o cadastro guarda somente um HMAC-SHA256 para permitir futuras verificações de duplicidade. Configure `CPF_HMAC_SECRET` com um segredo aleatório de pelo menos 32 caracteres, mantido fora do repositório. Cadastros de clientes falham de forma fechada se esse segredo não estiver configurado.

O cadastro não retorna links de ação nem senhas. O frontend deve usar o SDK Web do Firebase Authentication para enviar o e-mail de verificação e aplicar a ação concluída pelo usuário; configure os domínios autorizados e templates de e-mail no Firebase. O login e a redefinição de senha também são feitos pelo SDK Web. A API recebe o ID token como `Authorization: Bearer <idToken>` nas rotas protegidas. Ative no Firebase Authentication a proteção contra enumeração de e-mails e ajuste cotas contra abuso.

`GET /api/users/me` requer ID token válido e e-mail verificado. Retorna uma lista explícita de campos permitidos; clínicas pendentes podem consultar o próprio perfil. A senha nunca é salva no Firestore e CPF/CNPJ/endereço não são devolvidos por esse endpoint. Configure `CORS_ORIGINS` com as origens exatas do frontend; a aplicação se recusa a iniciar em produção sem essa configuração.

O endpoint público de cadastro tem um limite básico por IP em memória, configurável por `AUTH_REGISTRATION_MAX_PER_IP`. Em múltiplas instâncias, use também rate limiting distribuído no gateway/proxy. Para produção web, avalie Firebase App Check com reCAPTCHA e monitore antes de ativar enforcement. O logger HTTP omite rotas `/api/auth`; não inclua tokens nem dados pessoais em logs da aplicação.

