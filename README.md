# Exame Já — guia de uso do backend

Este projeto é a parte que recebe os pedidos do aplicativo, consulta os catálogos e organiza as informações para que a pessoa encontre clínicas que oferecem um exame. Ele funciona nos bastidores: a pessoa usa o aplicativo, e o aplicativo conversa com esta API.

## Como uma pessoa usa a busca

1. **Cria uma conta e confirma o e-mail.** Clientes e clínicas têm cadastros diferentes. A conta da clínica fica aguardando aprovação antes de poder publicar ofertas.
2. **Escolhe um exame do catálogo.** O catálogo apresenta exames com nome e código TUSS. A seleção é feita pela lista paginada; a busca de clínicas não recebe um nome digitado livremente. Cada busca é de um exame por vez.
3. **Informa onde quer procurar.** Pode usar um endereço ou compartilhar as coordenadas da localização. O raio começa em 10 km e pode ser ajustado até o máximo de 50 km.
4. **Escolhe os filtros, se desejar.** Pode limitar por convênio e por preço mínimo ou máximo. Os resultados podem ser ordenados por distância ou por preço.
5. **Consulta as opções.** Cada resultado reúne o nome e o endereço da clínica, o exame, o preço informado pela clínica, a distância e os convênios aceitos. Também são mostradas as coordenadas, caso o aplicativo queira abrir uma localização em um mapa.

A API não oferece, neste momento, comparação lado a lado nem agendamento. A pessoa pode comparar as informações apresentadas na lista e entrar em contato com a clínica pelos dados exibidos.

## De onde vêm as informações

- **Catálogo TUSS da ANS:** fornece os nomes e códigos usados para identificar exames. O catálogo é carregado por páginas e fica temporariamente em cache para reduzir consultas repetidas.
- **Ofertas das clínicas:** clínicas aprovadas cadastram os exames oferecidos e seus preços. O sistema confere se o código escolhido existe no catálogo e usa o nome oficial correspondente.
- **Localização:** o serviço Nominatim, com dados do OpenStreetMap, transforma endereços em coordenadas durante o cadastro, a atualização cadastral ou o preenchimento administrativo. A busca usa as coordenadas atuais já salvas e não consulta o geocodificador para cada clínica; clínicas sem coordenadas atuais ficam fora dos resultados até serem geocodificadas. Endereços e resultados de geocodificação também podem ser armazenados em cache.
- **CNES e produção SUS:** os estabelecimentos e a produção ambulatorial vêm de dados públicos do Ministério da Saúde. A consulta de produção pode trazer o estabelecimento CNES correspondente. Os valores são valores aprovados pelo SUS; não representam o preço cobrado por uma clínica particular. O sistema não converte automaticamente códigos TUSS em procedimentos SUS.
- **Cadastro de clínicas:** durante o cadastro, o CNPJ é consultado pela BrasilAPI e a razão social informada é comparada com o cadastro retornado. A aprovação da clínica continua dependendo da análise administrativa.
- **Contas e dados do produto:** o Firebase cuida da autenticação e o Firestore guarda informações como perfis, ofertas e dados auxiliares.

## Como uma clínica participa

A clínica cria uma conta, confirma o e-mail e aguarda a aprovação do cadastro. Depois de aprovada, pode manter sua lista de exames e preços. Quando altera dados importantes, como endereço ou telefone, o perfil volta para análise. A clínica também pode corrigir um cadastro rejeitado e reenviá-lo.

A clínica vê suas ofertas e o histórico de alterações.

## Ações disponíveis no aplicativo

Os caminhos abaixo são os endereços que o aplicativo usa para pedir informações à API. O endereço completo depende de onde o backend está publicado.

| O que a pessoa quer fazer | Caminho da API |
|---|---|
| Criar conta | `POST /api/auth/register` |
| Iniciar uma sessão segura | `POST /api/auth/session` |
| Recuperar a senha | `POST /api/auth/password-reset` |
| Solicitar novo e-mail de verificação | `POST /api/auth/email-verification` |
| Ver ou atualizar o próprio perfil | `GET` ou `PATCH /api/users/me` |
| Navegar pelo catálogo de exames | `GET /api/exams` |
| Procurar clínicas para um exame | `GET /api/clinics/search` |
| Consultar convênios disponíveis | `GET /api/convenios` |
| Consultar estabelecimentos do CNES | `GET /api/cnes/estabelecimentos` |
| Consultar produção ambulatorial do SUS | `GET /api/exams/sus-production` |

As alterações de conta exigem uma sessão válida. O catálogo e as buscas externas têm limites de uso para evitar excesso de chamadas a serviços de terceiros.

Para consultar produção SUS, é preciso informar um ano ou uma competência e também um município ou um código CNES. Os dados CNES associados aos resultados são mantidos em cache por até 24 horas para reduzir consultas repetidas ao Ministério da Saúde. Essa consulta é independente da busca de clínicas particulares.

## O que é necessário para colocar o serviço no ar

O backend precisa das credenciais do Firebase e das configurações de ambiente descritas em `.env.example`. Em produção também é necessário configurar as origens autorizadas do aplicativo e usar HTTPS. Administradores recebem uma permissão especial no Firebase; o repositório inclui um comando operacional para conceder ou remover essa permissão.

Para clínicas aprovadas que já existiam antes do salvamento automático de coordenadas, há um comando de preenchimento inicial: `npm run clinics:geocode`. Ele consulta os endereços ainda sem coordenadas atuais e grava os resultados encontrados.
