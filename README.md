# Exame Já — backend

Esta API conecta o site aos cadastros, ao catálogo de exames e às informações de clínicas. A pessoa usa o aplicativo; o site conversa com o backend, que consulta e organiza os dados.

## Como uma pessoa usa a busca

1. **Cria uma conta e confirma o e-mail.** Clientes e clínicas têm cadastros diferentes. O cadastro da clínica precisa ser aprovado antes que ela possa publicar ofertas.
2. **Escolhe um exame do catálogo.** O catálogo é paginado e identifica cada exame pelo nome e código TUSS. A busca de clínicas é feita para um exame por vez, sem texto livre.
3. **Informa onde quer procurar.** Pode digitar um endereço ou compartilhar as coordenadas. O raio começa em 10 km e pode ser ajustado até 50 km.
4. **Aplica filtros, se desejar.** Pode limitar por convênio e faixa de preço, e ordenar os resultados por distância ou preço.
5. **Consulta as opções.** Cada resultado apresenta clínica, endereço, exame, preço informado pela clínica, distância e convênios aceitos. As coordenadas também podem ser usadas pelo aplicativo para abrir uma localização no mapa.

A API não oferece comparação lado a lado. A pessoa pode consultar detalhes, avaliações e horários disponíveis da clínica, solicitar um horário e avaliar o atendimento após a conclusão do agendamento.

## De onde vêm as informações

- **Catálogo TUSS da ANS:** fornece os nomes e códigos usados para identificar exames. O catálogo é carregado por páginas e fica temporariamente em cache.
- **Ofertas das clínicas:** clínicas aprovadas cadastram exames e preços. O sistema verifica o código no catálogo e usa o nome correspondente.
- **Localização:** o Nominatim, com dados do OpenStreetMap, transforma endereços em coordenadas durante o cadastro, a atualização cadastral ou o preenchimento administrativo. A busca usa coordenadas atuais já salvas e não geocodifica cada clínica a cada consulta. Clínicas sem coordenadas atuais ficam fora dos resultados até serem geocodificadas.
- **CNES e produção SUS:** os estabelecimentos e a produção ambulatorial vêm de dados públicos do Ministério da Saúde. A consulta de produção pode trazer o estabelecimento CNES correspondente. Os valores são aprovados pelo SUS e não representam preços de clínicas particulares. O sistema não converte automaticamente códigos TUSS em procedimentos SUS.
- **Cadastro de clínicas:** o CNPJ é consultado pela BrasilAPI e a razão social informada é comparada com o cadastro retornado. A aprovação ainda depende da análise administrativa.
- **Contas e dados:** Firebase Authentication cuida da autenticação, e o Firestore armazena perfis, ofertas e dados auxiliares.

## Como uma clínica participa

A clínica cria uma conta, confirma o e-mail e aguarda a aprovação. Depois, pode manter sua lista de exames e preços. Alterações importantes, como endereço ou telefone, encaminham o cadastro para nova análise. Uma clínica rejeitada pode corrigir os dados e reenviá-los.

## Rotas principais

| Ação | Rota |
|---|---|
| Criar conta | `POST /api/auth/register` |
| Entrar com e-mail e senha | `POST /api/auth/login` |
| Restaurar sessão (JWT Bearer) | `GET /api/auth/me` |
| Iniciar uma sessão segura | `POST /api/auth/session` |
| Recuperar a senha | `POST /api/auth/password-reset` |
| Solicitar novo e-mail de verificação | `POST /api/auth/email-verification` |
| Ver ou atualizar o próprio perfil | `GET` ou `PATCH /api/users/me` |
| Navegar pelo catálogo de exames | `GET /api/exams` |
| Procurar clínicas para um exame | `GET /api/clinics/search` |
| Consultar detalhes públicos da clínica | `GET /api/clinics/:uid` |
| Consultar horários disponíveis | `GET /api/clinics/:uid/availability?inicio=...&fim=...` |
| Publicar horários da clínica | `POST /api/clinics/me/availability` |
| Remover horário livre | `DELETE /api/clinics/me/availability/:dataHora` |
| Consultar avaliações da clínica | `GET /api/clinics/:uid/reviews` |
| Enviar avaliação | `POST /api/reviews` |
| Criar solicitação de agendamento | `POST /api/appointments` |
| Listar agendamentos próprios | `GET /api/appointments` |
| Consultar agendamento participante | `GET /api/appointments/:id` |
| Confirmar, recusar, cancelar ou concluir agendamento | `PUT /api/appointments/:id` |
| Consultar convênios disponíveis | `GET /api/convenios` |
| Consultar estabelecimentos CNES | `GET /api/cnes/estabelecimentos` |
| Consultar produção ambulatorial SUS | `GET /api/exams/sus-production` |
| Consultar ofertas da clínica | `GET /api/clinics/me/exams` |
| Criar ou atualizar uma oferta | `PUT /api/clinics/me/exams/:codigoExame` |
| Desativar uma oferta | `DELETE /api/clinics/me/exams/:codigoExame` |

Requisições `POST`, `PUT`, `PATCH` ou `DELETE` sem cabeçalho Bearer exigem CSRF, exceto `POST /api/auth/login`, que não cria cookies e retorna apenas um token Bearer. Para as demais operações, obtenha o CSRF em `GET /api/auth/csrf` e envie o valor retornado em `X-CSRF-Token`. O login recebe `{ "email": "...", "senha": "..." }` e retorna `token`, `tokenType`, `expiresIn` (segundos) e `usuario` (`id`, `nome`, `email`, `tipo`, `status`, `administrador`). A verificação do email é consultada no Firebase Admin após a autenticação, pois não se deve depender desse campo na resposta de senha. As falhas de login incluem `code` estável e `message` para exibição; credenciais inválidas sempre retornam a mesma mensagem. O token de identidade do Firebase expira em uma hora; ao expirar, o cliente deve autenticar novamente. Envie-o às rotas privadas como `Authorization: Bearer <token>`. `GET /api/auth/me` retorna os dados básicos atuais, incluindo status e indicador de administrador. O fluxo de sessão por cookie em `/api/auth/session` continua disponível. Configure `CORS_ORIGINS` com a origem exata do frontend (incluindo protocolo e porta); o CORS expõe `X-Request-ID` e `Retry-After` ao frontend para diagnóstico. Os tokens são emitidos pelo Firebase Authentication.

`POST /api/auth/logout` limpa os cookies da sessão. Quando recebe `Authorization: Bearer <token>`, revoga os tokens Firebase da conta; isso encerra também outras sessões e dispositivos dessa conta. O cliente deve descartar o token localmente.

O cadastro de cliente exige `tipo: "cliente"`, `nome`, `email`, `senha`, `cpf` e `telefone`. O cadastro de clínica exige `tipo: "clinica"`, `email`, `senha`, `dominioCorporativo`, `razaoSocial`, `nomeFantasia`, `cnpj`, `telefone`, `endereco` e `declaracaoVinculo`; `cnes` é opcional. Erros usam `{ "message": "..." }`. A recuperação de senha está disponível em `POST /api/auth/password-reset`.

Pacientes podem atualizar o nome pelo `PATCH /api/users/me` enviando `{ "nome": "..." }` (até 120 caracteres). Para perfis legados sem nome, as respostas de usuário mostram `Paciente` até o nome ser atualizado; clínicas sem nome fantasia usam `Clínica` como fallback.

`GET /api/clinics/suggestions` aceita `limite` (1–50, padrão 20) e `cursor`; a resposta inclui `proximoCursor` para buscar a próxima página. As alterações de conta exigem autenticação válida. O catálogo e as consultas externas têm limites de uso. Para consultar produção SUS, informe um ano ou competência e também município ou código CNES. Essa consulta é independente da busca por clínicas particulares; os dados CNES associados ficam em cache por até 24 horas.

`GET /api/clinics/:uid` é público e só retorna clínicas aprovadas, com endereço, telefone, coordenadas atuais, convênios ativos e ofertas de exames ativas. Dados cadastrais privados, como CNPJ e e-mail, não são incluídos.

As rotas de agendamento exigem autenticação por cookie ou Bearer. Clientes criam solicitações com `clinicaUid`, `nomeExame`, `dataHora` ISO 8601 e, opcionalmente, `codigoExame`; só são aceitos horários publicados e livres. A solicitação começa como `pendente`; a clínica pode confirmar, recusar (com motivo) e concluir após o exame. O cliente pode cancelar enquanto pendente ou confirmado. Solicitações pendentes cujo horário passou são marcadas como `expirado` quando listadas ou quando alguém tenta atualizá-las; horários expirados não podem ser confirmados ou avaliados. `POST /api/clinics/me/availability` recebe `{ "horarios": ["2027-01-12T13:00:00-03:00"] }`; horários devem estar no futuro e em minuto exato. `DELETE /api/clinics/me/availability/:dataHora` remove um horário ainda não reservado. A consulta pública recebe `inicio` e `fim` em ISO 8601, com janela máxima de 31 dias, e aceita `limite` e `cursor`.

O paciente avalia uma única vez cada agendamento concluído por `POST /api/reviews`, enviando `{ "agendamentoId": "...", "nota": 1, "comentario": "..." }`; nota vai de 1 a 5 e comentário é opcional (até 1000 caracteres). `GET /api/clinics/:uid/reviews` retorna avaliações sem identificação do paciente, média e quantidade, com paginação. Os detalhes e resultados da busca incluem `avaliacaoMedia` e `quantidadeAvaliacoes`.

### Integração da busca com o mapa

O mapa do aplicativo deve usar os mesmos resultados da busca: não há uma rota separada de mapa. Primeiro carregue o catálogo em `GET /api/exams?page=1&limit=100` e use o campo `codigo` do exame selecionado. Em seguida, chame `GET /api/clinics/search` com esse código e uma localização (endereço ou coordenadas). Por exemplo:

```http
GET /api/clinics/search?codigoExame=CODIGO_TUSS&latitude=-23.5505&longitude=-46.6333&raioKm=10&ordenar=distancia
```

Opcionalmente, use `convenioId` (ID ativo retornado por `GET /api/convenios`), `precoMinimo`, `precoMaximo`, `limit` e `offset`. A resposta contém `resultados`; cada item tem `clinica.latitude`, `clinica.longitude`, `clinica.endereco`, `clinica.distanciaKm`, `clinica.avaliacaoMedia`, `clinica.quantidadeAvaliacoes`, `exame.nome` e `preco.valor`. Esses campos alimentam tanto os cartões quanto os marcadores do mapa. A rota aceita ordenação por `distancia` ou `preco`.

O frontend atualmente presente no repositório relacionado usa outra rota (`/establishments`), identificadores de exame de mocks e os campos `lat`/`lng`. Para integração ponta a ponta, ele ainda precisa chamar as rotas documentadas acima com código TUSS e localização e mapear `clinica.latitude`/`longitude` para os campos consumidos pelo componente Leaflet. O backend não consegue inferir com segurança uma localização do usuário nem converter IDs de mocks em códigos TUSS.

## Como executar

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e preencha as configurações necessárias do Firebase.
3. Inicie a API com `npm start`.

Em produção, configure as origens autorizadas do aplicativo e use HTTPS. O backend inclui comandos operacionais para gerenciar administradores, migrar hashes de CPF legados e preencher coordenadas de clínicas existentes (`npm run clinics:geocode`).

## Tecnologias e organização

- Node.js e Express
- Firebase Authentication e Firestore
- APIs externas: TUSS/ANS, CNES e produção SUS, BrasilAPI e Nominatim/OpenStreetMap

O código é organizado em `routes` (rotas), `controllers` (requisições e respostas), `services` (regras e integrações), `repositories` (Firestore), `middleware` (autenticação e proteções) e `validators` (validação de dados).

Execute os testes automatizados com `npm test`.

## Equipe

| Nome | Área |
|---|---|
| Daniel Viana de Farias | Front-end |
| Bruno Henrique Brasil da Silva | Front-end |
| Leticia Monteiro Alves da Silva | Back-end |
| Felipe Mota Damasceno | Back-end |
