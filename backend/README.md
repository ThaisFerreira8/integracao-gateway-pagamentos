# Backend Nexora

API NestJS BaaS com banco MySQL próprio e integração HTTP com o gateway de simulação. Veja o [README principal](../README.md) para arquitetura e demonstração.

## Requisitos e instalação

- Node.js 24.11 ou superior na linha 24, npm e Git.
- MySQL 8 em execução e usuário autorizado no banco BaaS.
- Acesso HTTPS ao gateway para fluxos integrados. Testes automatizados usam mocks.

Na pasta backend:

~~~bash
npm ci
~~~

Copie .env.example para .env pelo editor ou no PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

## Configuração

| Variável | Uso |
| --- | --- |
| NODE_ENV | development localmente; influencia a exigência HTTPS do vínculo. |
| PORT | Porta da API, 3000 no exemplo. |
| DB_HOST / DB_PORT | Host e porta do MySQL, localhost / 3306 no exemplo. |
| DB_USERNAME / DB_PASSWORD | Credenciais locais do usuário do banco. |
| DB_DATABASE | integracao_gateway_pagamentos no exemplo. |
| FRONTEND_URL | Origem CORS, http://localhost:5173 no exemplo. |
| JWT_SECRET | Segredo próprio do BaaS, mínimo 32 bytes. |
| JWT_EXPIRES_IN_SECONDS | Inteiro positivo; 3600 segundos no exemplo. |
| GATEWAY_ENCRYPTION_KEY | 32 bytes representados por exatamente 64 caracteres hexadecimais; independente de JWT_SECRET. |
| GATEWAY_BASE_URL | URL HTTPS com raiz ou /api; cliente normaliza o caminho. |
| GATEWAY_TIMEOUT_MS | Timeout positivo em milissegundos, 10000 no exemplo. |

Preencha os segredos vazios antes de iniciar. Gere cada segredo separadamente, copiando somente para o .env local; não reutilize a mesma saída:

~~~bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
~~~

Mantenha a chave de criptografia estável/protegida: trocá-la impede ler credenciais já cifradas. Documento/senha gateway pertencem a cada conta, não são variáveis globais necessárias. Nunca copie valores pessoais para exemplos.

ConfigModule e DataSource da CLI carregam o .env com override: true. Execute os comandos dentro de backend; valores locais prevalecem sobre variáveis homônimas herdadas.

## MySQL e migrations

Em uma conexão administrativa MySQL, prepare um banco exclusivo. Este SQL é exemplo para instalação nova; substitua a senha fictícia antes de executar:

~~~sql
CREATE DATABASE integracao_gateway_pagamentos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'nexora_app'@'localhost'
  IDENTIFIED BY 'SUBSTITUA_POR_UMA_SENHA_LOCAL_FORTE';

GRANT ALL PRIVILEGES ON integracao_gateway_pagamentos.*
  TO 'nexora_app'@'localhost';
~~~

Use DB_USERNAME=nexora_app e a senha escolhida em DB_PASSWORD. Ajuste host/permissões para MySQL remoto. O usuário precisa de DDL para migrations e leitura/escrita para a aplicação. Não use o banco de outro projeto ou do gateway.

A CLI usa src/database/data-source.ts, entidades src/**/*.entity.ts e migrations src/database/migrations/*.ts. A migration 1791597427065-criar-estrutura-inicial.ts cria sete tabelas de domínio: usuarios, contas_gateway, links_checkout, pedidos, transacoes, saques e eventos_webhook.

~~~bash
npm run migration:show
npm run migration:run
~~~

Confira o banco antes de aplicar. synchronize está desativado e iniciar Nest não aplica migrations automaticamente. migration:run altera o banco e é etapa explícita de uma instalação nova. A tabela eventos_webhook existe, mas processamento de callbacks não está implementado.

~~~bash
# Reversão intencional da última migration; pode remover tabelas e dados.
# Use somente com autorização e backup adequado.
npm run migration:revert
~~~

## Inicialização e Swagger

~~~bash
npm run start:dev
~~~

Execução compilada:

~~~bash
npm run build
npm run start:prod
~~~

O nome start:prod indica execução compilada; o ambiente efetivo depende de NODE_ENV. Para reprodução local HTTP, mantenha development. Não há implantação HTTPS configurada.

- API: http://localhost:3000.
- Swagger: http://localhost:3000/docs.
- OpenAPI: http://localhost:3000/docs-json.

Configure segredos, banco e migration antes de iniciar. Em erro de acesso MySQL, confira usuário/senha/host/permissões. Não ative synchronize para substituir migrations.

## Autenticação e integração gateway

POST /autenticacao/cadastro é público, recebe nome, email e senha (8 a 128 caracteres), normaliza o e-mail, rejeita duplicação com 409 e persiste hash scrypt com sal. Retorna somente id, nome e email.

POST /autenticacao/login recebe email/senha e retorna tokenAcesso, tipoToken e usuario. Em **Authorize** do Swagger, informe o JWT BaaS da sua sessão, não o token gateway. Rotas privadas verificam token e usuário existente. usuarioId fornecido pelo cliente não determina o proprietário.

Cadastro local não cria conta gateway. Para usar a integração:

1. Crie/autentique seu usuário local.
2. Se necessário, use POST /contas-gateway/cadastro com o DTO PF/PJ descrito no Swagger. E-mail/telefone devem ser válidos; as credenciais são entregues pelo gateway por e-mail.
3. Use POST /contas-gateway/vinculo com documento e senha da própria conta, como entrada transitória. Não publique esses valores em exemplos, capturas ou histórico.
4. Confira GET /contas-gateway, sem credenciais na resposta.

O vínculo exige HTTPS em produção. Em development/test, HTTP exige hostname local e conexão de loopback; X-Forwarded-Proto enviado diretamente não libera o acesso. Não há tela de onboarding gateway; use a API privada local. Senha gateway não é persistida e não há renovação automática usando senha armazenada; renove o vínculo quando necessário.

O GatewayHttpService centraliza HTTP com HTTPS, validação de base/caminho, timeout e tratamento de erros. O token vem somente do vínculo do lojista ou do proprietário do link público. O gateway usa https://api.branchpay.com.br/api; o BaaS não tem prefixo /api.

## Principais endpoints

| Método / rota BaaS | Acesso e finalidade |
| --- | --- |
| POST /autenticacao/cadastro | Público; usuário local. |
| POST /autenticacao/login | Público; sessão BaaS. |
| POST /contas-gateway/cadastro | JWT; cadastro externo PF/PJ. |
| POST /contas-gateway/vinculo | JWT; vínculo/renovação da própria conta. |
| GET /contas-gateway | JWT; vínculo sem credenciais. |
| GET /checkouts/taxas?bandeira=VISA | JWT; taxas e filtro opcional VISA/MASTERCARD/ELO. |
| POST /checkouts | JWT; link/pedido com referência externa do backend. |
| GET /checkouts | JWT; lista do proprietário. |
| GET /checkout/:identificador | Público; identificador público UUID. |
| POST /checkout/:identificador/pix | Público; entrada documentoPagador. |
| POST /checkout/:identificador/cartao | Público; cartão transitório e condição validada. |
| POST /checkouts/:identificador/conciliar | JWT; conciliação do próprio pagamento pelo identificador público do checkout. |
| GET /pagamentos | JWT; lista local com filtros/paginação. |
| GET /pagamentos/referencia?referenciaExterna=... | JWT; busca local por referência. |
| GET /pagamentos/:id | JWT; UUID local do pedido. |
| GET /carteira | JWT; saldo. |
| GET /carteira/extrato | JWT; extrato consolidado. |
| POST /saques | JWT; solicita saque. |
| GET /saques e GET /saques/:id | JWT; lista/detalhe local. |
| POST /saques/:id/conciliar | JWT; consulta externa; UUID local do saque. |
| POST /webhooks | JWT; configuração; 204 sem corpo em sucesso. |
| GET /webhooks | JWT; [] confirmado; formatos desconhecidos retornam 502. |
| DELETE /webhooks/:id | JWT; id opaco de segmento seguro; 204 em sucesso. |

Links recebem valorCentavos, metodo PIX/CARTAO e expiraEm futuro. Cartão exige bandeira e parcelas; não envie feePercent. O backend determina a taxa da tabela. Alteração da taxa entre criação/pagamento bloqueia o envio; crie outro link sem reescrever a condição histórica.

Saques recebem valorCentavos, chavePix, documentoTitular (CPF com 11 dígitos), descricao e referenciaExterna opcionais. O backend gera referência quando ausente. Referência informada está sujeita à unicidade no banco. Respostas não retornam chave/documento.

Pagamentos locais aceitam APPROVED, DENIED, EXPIRED e CANCELLED, referenciaExterna, pagina e limite. Defaults/limites constam no Swagger. EXPIRED/CANCELLED exigem estado da transação; expiração do link não comprova estado financeiro.

Extrato aceita status PENDING/APPROVED/DENIED/EXPIRED/CANCELLED, type PIX/CREDIT_CARD/WITHDRAWAL e limit inteiro positivo. Não há page, offset ou cursor. A consolidação usa id externo ou referência única com tipo compatível e valida valor/referências. O estado externo prevalece quando comprovado; casos ambíguos permanecem separados. A consulta não modifica registros. limit restringe a consulta externa e o resultado consolidado, sem garantir todo o histórico.

## Segurança, valores e falhas

Credenciais gateway persistidas usam AES-256-GCM: chave obrigatória, nonce aleatório e authentication tag. Senha gateway não é armazenada; tokens/credenciais não são devolvidos ao frontend. Número completo de cartão/CVV não são persistidos ou logados. Documento/chave Pix de saque usam colunas privadas nas respostas, mas não são criptografados em repouso pelo modelo atual.

Valores de operações/links/itens de extrato são centavos inteiros. Taxas são percentuais. Saldo é preservado como retornado e balanceFormatted é usado na interface; a unidade de balance não foi comprovada na investigação, embora o PDF o descreva em centavos.

Respostas incompatíveis, divergências de valor/referência e identificadores duplicados no extrato podem gerar 502; timeout pode gerar 504. Não interprete erros como lista vazia ou sucesso. Uma reserva financeira é feita antes do POST externo. Em falha/timeout, consulte/concilie antes de repetir. A conciliação pode recuperar id por referência única na resposta externa disponível. Não há retry automático do POST de pagamento, job de polling ou callback financeiro.

## Webhooks e pendências

Administração aceita PAYMENT_PIX, PAYMENT_CARD ou WITHDRAWAL, URL HTTPS e secret opcional writeOnly; não persiste, retorna ou registra secret. POST/DELETE descartam corpos externos. GET aceita somente [] confirmado; listas não vazias retornam 502 até comprovação do contrato dos itens.

Não existe receptor público nem URL HTTPS pública própria. HMAC-SHA256(body, secret) e X-Lera-Box-Signature estão descritos; faltam bytes assinados, serialização/canonicalização, encoding/prefixo, schema do payload, identidade do evento e associação segura à conta. Não há rawBody presumido, validação HMAC incompleta, idempotência de eventos ou atualização financeira por callback. Não cadastre destino de terceiros para contornar essa limitação.

## Testes

~~~bash
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
~~~

Testes usam mocks do gateway, sem operações externas. O teste da migration prepara metadados/SQL sem aplicar migrations. A inicialização normal exige MySQL e estrutura aplicada. Não existe teste financeiro real automático.

Na raiz, revise git diff --check e git status --short. Nunca versione .env, credenciais, números reais de cartão, CVV ou capturas sensíveis.
