# Nexora — Integração BaaS com gateway de pagamentos

Projeto do desafio técnico da VBA Systems: produto para lojistas com checkout público, integração HTTP com o gateway simulado Lera Box e persistência própria.

## Arquitetura

~~~text
React + Vite → NestJS BaaS → Gateway Lera Box
                   ↓
              MySQL próprio
~~~

O frontend acessa somente o BaaS. Não existe acesso direto ao banco do gateway. O backend usa TypeScript, NestJS, TypeORM, MySQL, class-validator, class-transformer e Swagger. O frontend usa React, TypeScript e Vite. Jest e Supertest validam o backend com mocks.

~~~text
backend/   API, entidades, migration, integração e testes
frontend/  interface Nexora, checkout público e cliente HTTP do BaaS
~~~

## Funcionalidades

- Cadastro/login local, JWT e isolamento por lojista.
- Cadastro PF/PJ e vínculo gateway pela API privada; não há tela de onboarding gateway.
- Links e pedidos com identificador próprio e referência externa gerada pelo backend.
- Taxas por bandeira/parcelas registradas na criação do link e verificadas novamente antes do pagamento.
- Pix com QR/EMV retornados pelo gateway e cartão com dados transitórios.
- Consultas locais de pagamentos, filtros e conciliação externa manual pela API privada.
- Saldo e extrato consolidado de transações locais, saques e registros externos.
- Solicitação de saque na interface, detalhes e conciliação de status.
- Administração privada de configurações de webhook, com restrição defensiva na listagem.

## Execução local

Requisitos: Node.js 24.11 ou superior na linha 24, npm, Git e MySQL 8. Siga [backend/README.md](backend/README.md) para criar o banco e configurar os segredos.

~~~bash
git clone https://github.com/ThaisFerreira8/integracao-gateway-pagamentos.git
cd integracao-gateway-pagamentos/backend
npm ci
~~~

Copie backend/.env.example para backend/.env, preencha os valores locais e crie o banco. Em uma instalação nova, aplique explicitamente a migration:

~~~bash
npm run migration:show
npm run migration:run
npm run start:dev
~~~

Em outro terminal, entre na pasta frontend, execute npm ci, copie frontend/.env.example para frontend/.env e execute npm run dev. Consulte [frontend/README.md](frontend/README.md).

| Recurso | Endereço |
| --- | --- |
| Interface | http://localhost:5173 |
| API | http://localhost:3000 |
| Swagger BaaS | http://localhost:3000/docs |
| OpenAPI BaaS | http://localhost:3000/docs-json |
| Repositório | https://github.com/ThaisFerreira8/integracao-gateway-pagamentos |

Não há URL pública, Docker ou deploy preparado. Crie suas próprias credenciais de demonstração na tela **Criar conta**; não existe acesso compartilhado predefinido. Esse cadastro cria somente o usuário local.

## Fluxos e roteiro de demonstração

1. Crie uma conta local, entre e confira a navegação. Recarregar exige novo login.
2. Para integração, cadastre/vincule sua conta sandbox pela API privada, conforme o README do backend. Não compartilhe credenciais gateway.
3. Crie um link Pix/cartão. Para cartão, escolha bandeira e parcelas e confira a taxa registrada. Copie e abra o checkout público.
4. Somente com autorização para operações no sandbox, use dados oficiais de teste e confira aprovação/negação e QR/EMV retornados. Não use cartão real nem pague o QR com conta real.
5. Consulte Transações; concilie pagamentos pela API privada quando necessário. Consulte Carteira e seus filtros.
6. Para demonstrar Saques, use somente destino de teste autorizado; confira a listagem e **Consultar status externo**.
7. Mostre as limitações de Webhooks. Não cadastre destinos de terceiros para testar callbacks.
8. Saia e confirme que a sessão foi removida.

## Segurança e dinheiro

A identidade vem do JWT verificado; o cliente não determina o proprietário por usuarioId. O JWT fica somente em memória, sem localStorage/sessionStorage. Senhas locais usam scrypt com sal. A senha gateway não é persistida; tokens/credenciais do vínculo são protegidos por AES-256-GCM com nonce aleatório, tag e chave independente do segredo JWT.

Número completo de cartão e CVV são transitórios, sem persistência/logs. Chave Pix e documento de saque são armazenados no banco conforme o modelo atual, excluídos das respostas, mas não criptografados por esse mecanismo de credenciais. Não use dados pessoais reais na demonstração. O checkout público não envia Bearer administrativo.

Links, operações e itens do extrato usam centavos inteiros. A entrada em reais é convertida pela composição dos dígitos, sem multiplicação imprecisa. Taxas são percentuais. O saldo usa balanceFormatted para exibição e preserva balance sem conversão: o PDF o descreve em centavos, mas a unidade não foi comprovada na investigação das respostas.

## Limitações e requisitos pendentes

- **Webhooks financeiros:** não há receptor, validação de assinatura, deduplicação de eventos ou atualização financeira por callbacks. Falta URL HTTPS pública sob controle da aplicação.
- O gateway descreve HMAC-SHA256(body, secret) e X-Lera-Box-Signature, mas não especifica bytes assinados, serialização/canonicalização, encoding/prefixo, schema do payload, identificador único nem associação segura à conta. O algoritmo nominal está documentado; o contrato de verificação completo não está.
- POST/DELETE de configurações descartam o corpo externo e retornam 204 em sucesso. GET /webhooks aceita somente []; lista não vazia ou formato não confirmado retorna **502**. A gestão completa de ponta a ponta permanece limitada.
- Conciliação é explícita, sem jobs/polling automático. A conciliação de pagamentos está na API, sem botão específico na tela Transações.
- O extrato consolida a resposta externa disponível com registros locais. Não possui paginação/cursor; limit restringe a consulta externa e o resultado consolidado. Não garante todo o histórico externo nem modifica estados no banco. Casos ambíguos permanecem separados; divergências de valor/referência ou identificadores duplicados geram 502.
- EXPIRED/CANCELLED na lista de pagamentos exigem transações nesses estados; a expiração do link não prova expiração financeira. Pedidos locais possuem PENDENTE, APROVADO e NEGADO.
- Falhas/timeouts podem deixar uma reserva financeira pendente. Consulte/concilie antes de repetir. Não há repetição automática do POST de pagamento.
- O frontend não possui suíte automatizada própria; build/lint são as verificações disponíveis.

O requisito obrigatório de processamento assíncrono por webhooks permanece pendente. Docker Compose, deploy HTTPS, envio de links e comprovante são diferenciais não implementados.

## Verificações

Backend: npm run build, npm test -- --runInBand e npm run test:e2e -- --runInBand.
Frontend: npm run build e npm run lint. Revise também git diff --check e git status.

Os testes automatizados não criam operações no gateway. Os READMEs específicos detalham instalação, comandos e limitações.

