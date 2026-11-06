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

