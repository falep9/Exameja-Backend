# Exame Já - Backend

API do Exame Já, um site que ajuda pacientes a encontrar, comparar e agendar exames médicos em clínicas e laboratórios.

## Tecnologias

- Node.js + Express
- Firebase (Firestore e Auth)
- APIs externas: CNES (Datasus), Nominatim (geocoding)

## Como rodar

1. Instalar as dependências:

```
npm install
```

2. Copiar o `.env.example` para `.env` e preencher com as credenciais do Firebase.

3. Iniciar a API:

```
npm start
```

## Testes

```
npm test
```

## Estrutura de pastas

```
src/
  config/        configuração do Firebase
  routes/        rotas da API
  controllers/   recebem a requisição e devolvem a resposta
  services/      regras de negócio
  repositories/  acesso ao Firestore
  middleware/    autenticação e proteções
  validators/    validação de dados
  utils/         funções auxiliares
test/            testes automatizados
```

## Rotas principais

| Rota | O que faz |
|---|---|
| `/api/auth` | Cadastro e login |
| `/api/users` | Perfil do usuário |
| `/api/convenios` | Convênios |
| `/api/clinics` | Busca de clínicas |
| `/api/admin/clinics` | Aprovação de clínicas (admin) |
| `/api/exams` | Exames (TUSS e SUS) |
| `/api/cnes` | Consulta de estabelecimentos no CNES |
| `/api/geocoding` | Converte endereço em coordenadas |
| `/api/conversations` | Chat entre cliente e clínica |

## Equipe

| Nome | Área |
|---|---|
| Daniel Viana de Farias | Front-end |
| Bruno Henrique Brasil da Silva | Front-end |
| Leticia Monteiro Alves da Silva | Back-end |
| Felipe Mota Damasceno | Back-end |
