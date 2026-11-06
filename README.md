Novos endpoints para Daniel

### Catálogo TUSS da ANS
`GET /api/exams?q=hemograma&page=1&limit=20`

- `q` ou `termo`: busca por texto (até 120 caracteres).
- `page`: página iniciando em 1; `limit`: 1 a 100.
- Retorna nomes/códigos padronizados TUSS. A presença no catálogo não confirma disponibilidade de um prestador nem cobertura do plano.
- A resposta é mantida em cache em memória por seis horas.

### Produção ambulatorial SIA/SUS
`GET /api/exams/sus-production?ano=2025&municipio=3550308&limit=100&offset=0`

- Filtros opcionais: `ano` ou `competencia` (formato `AAAAMM`), `municipio` (código IBGE) e `cnes`.
- `limit`: 1 a 1000; `offset`: deslocamento repassado ao serviço do Ministério.
- Os valores aprovados são dados do SUS; não são preços particulares.

As URLs e o timeout configuram-se por `ANS_TUSS_API_URL`, `MINISTERIO_SAUDE_API_URL` e `EXTERNAL_API_TIMEOUT_MS`.

