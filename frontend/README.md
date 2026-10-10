# Frontend Nexora

Interface React + TypeScript + Vite para o lojista e checkout público. Veja o [README principal](../README.md) e o [backend](../backend/README.md) para preparar BaaS, banco e integração.

## Instalação e ambiente

Use Node.js 24.11 ou superior na linha 24 e npm. Dentro de frontend:

~~~bash
npm ci
~~~

Copie .env.example para .env pelo editor ou no PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

Configuração local:

~~~dotenv
VITE_API_URL=http://localhost:3000
~~~

VITE_API_URL é obrigatória, sem fallback fixo. Informe o BaaS, não o gateway. A validação rejeita credenciais na URL, query e fragmento. HTTPS é exigido fora do loopback; HTTP somente para localhost, 127.0.0.1 ou ::1. Variáveis VITE são públicas no bundle: não inclua token, senha, ChaveLoja, JWT_SECRET ou chave de criptografia. Reinicie o Vite/recompile após mudar a configuração.

O backend deve estar em execução e FRONTEND_URL deve corresponder à origem da interface: http://localhost:5173 no exemplo. Se a porta estiver ocupada e Vite usar outra, ajuste a origem CORS ou libere a porta 5173.

## Execução e verificações

~~~bash
npm run dev
npm run build
npm run lint
~~~

Acesse http://localhost:5173. Para conferir o build:

~~~bash
npm run preview
~~~

Preview usa outra origem, normalmente porta 4173; ajuste o CORS para testá-lo. Build não faz deploy. Não existe comando npm test nem suíte própria automatizada do frontend. Build verifica TypeScript/bundle e lint verifica código; mocks pontuais de API usados no desenvolvimento não constituem suíte versionada de interface.

## Comunicação e autenticação

Chamadas centralizadas em src/servicos/api.ts acessam somente o BaaS. Não há integração HTTP direta com o gateway ou credenciais gateway no frontend.

- **Criar conta:** nome, e-mail e senha; cria apenas usuário local.
- **Entrar:** /autenticacao/login; identifica o usuário e recebe JWT BaaS.
- **Sessão:** token somente em memória, sem localStorage/sessionStorage. Recarregar exige novo login; o token pode expirar.
- **Sair:** remove token/sessão em memória.
- **Checkout público:** nunca envia Authorization, mesmo com sessão administrativa.

Senhas não são armazenadas no navegador. O cliente apresenta mensagens controladas, sem reproduzir indiscriminadamente corpos externos de erro.

## Telas e fluxos

| Tela | Disponível |
| --- | --- |
| Login/cadastro | Usuário e sessão locais. |
| Visão geral | Estrutura autenticada sem métricas financeiras fictícias. |
| Links | Criação/listagem, bandeira/parcelas, taxa registrada, copiar/abrir checkout. |
| Checkout público | Pix/cartão, estado e QR/EMV efetivamente retornados. |
| Transações | Pedidos/transações locais, filtros e paginação BaaS. Conciliação pela API privada, sem botão próprio nesta tela. |
| Carteira | balanceFormatted e extrato consolidado com status/tipo/limite. |
| Saques | Solicitação, registros/detalhes locais e consulta/conciliação externa. |
| Webhooks | Configuração administrativa de evento, URL HTTPS e secret opcional; listagem vazia confirmada ou erro defensivo. |

Operações integradas exigem conta gateway vinculada. Não há formulário de onboarding gateway; realize cadastro/vínculo pela API privada conforme o README do backend.

Links usam reais na entrada e centavos inteiros na API. A conversão compõe dígitos, aceita até duas casas decimais e rejeita separador de milhar. Cartão exige condição na criação; mudança na tabela bloqueia envio pelo backend. Links anteriores sem taxa registrada mantêm o tratamento compatível existente.

Número e CVV são entradas transitórias no checkout, não mantidos no estado React nem persistidos. Chave Pix/documento de saque são limpos no envio e ausentes das respostas; não coloque dados pessoais reais na demonstração.

Após solicitar saque, a lista é atualizada e o estado retornado é informado. **Consultar status externo** concilia o registro sem criar novo saque. Em falha/timeout, confira a listagem e concilie antes de repetir; não há repetição automática.

## Limitações

- Atualização assíncrona por webhook e polling automático do checkout não estão implementados.
- GET /webhooks retorna 502 para listas não vazias de estrutura não comprovada. A interface mostra erro, sem inventar lista vazia. Remoção administrativa depende de id opaco conhecido, sem itens/IDs fictícios.
- Não há URL pública própria para callbacks; não use terceiros como destino.
- Extrato consolida os registros externos disponíveis e os locais do proprietário. limit não garante todo o histórico; casos ambíguos permanecem separados. Erro 502 não significa ausência de transações.
- balance não é convertido: sua unidade não foi comprovada na investigação, embora o PDF o descreva em centavos. A interface exibe balanceFormatted.
- Não há tela de onboarding gateway, suíte automatizada de navegador, Docker, deploy, envio de link ou comprovante.

Para demonstração financeira, use somente sandbox e dados de teste autorizados. A configuração local e o cadastro do usuário BaaS podem ser demonstrados sem criar pagamento ou saque.
