# Separação para HYVE-ORG e revisão da beta — 30/10/2026

## Resultado da revisão

O checkout completo passou em `npm run build` (TypeScript, web, renderer desktop
e API), 160 testes TypeScript existentes e 18 testes documentais. A primeira
execução isolada falhou por EACCES de sockets e EPERM em diretórios temporários;
as mesmas suítes passaram fora desse isolamento. Isso valida o código local,
não uma implantação pública nem uma auditoria exaustiva de segurança.

Os repositórios solicitados são `HYVE-ORG/API-HYVE`, `WEB-VERSION`,
`DESKTOP-VERSION` e `DOCS`. Inicialmente a integração GitHub retornou 404;
nenhum arquivo foi enviado enquanto o acesso estava indisponível. Na retomada,
o acesso de escrita foi confirmado nos quatro repositórios públicos vazios,
com branch padrão `main`. Este snapshot documenta a preparação do envio;
a confirmação do commit remoto deve ser conferida no GitHub. Deploy Vercel
e liberação funcional da beta continuam etapas separadas.

Validação dos diretórios separados após a correção de `dayIn`: API 102/102
testes, web 23/23 e desktop 154/154; TypeScript e builds nos três destinos
passaram. DOCS extraído passou em `--check`, e a suíte documental passou
novamente em 18/18. Foram reutilizadas temporariamente as dependências locais
do lockfile para essas verificações; não foi simulada uma instalação limpa em
uma VM nem executado Docker. O vínculo fica fora dos diretórios dos repositórios.

## Exportação revisável

`work/prepare_beta_repositories.py --output outputs/github-beta/NOVO-DESTINO`
gera quatro diretórios novos, sem sobrescrever checkouts existentes. O script
nunca chama Git, instala dependências ou publica serviços. O manifesto externo
lista caminhos, tamanho e SHA-256 de cada arquivo gerado.

| Repositório | Conteúdo |
| --- | --- |
| API-HYVE | NestJS, contratos, migrations/testes SQL, operação da API e testes pertinentes; borda Cloudflare opcional preservada em `apps/edge` |
| WEB-VERSION | React/Vite, landing, fontes/assets locais, contratos e testes de interface |
| DESKTOP-VERSION | Electron, renderer web, API embarcada, contratos e scripts de build/atualização |
| DOCS | Pacote documental canônico, fontes legais e ferramentas/testes de manutenção |

O desktop depende do renderer e da API embarcada: copiar só `apps/desktop`
produziria um checkout incompleto. As dependências compartilhadas são snapshots
da mesma revisão, não serviços extras. `package-lock.json` mantém o grafo já
testado, inclusive dependências de desenvolvimento do MVP, sem resolver novas
versões durante a separação. Cada destino tem scripts e tsconfig adequados.

Foi corrigida uma dependência cruzada: `dayIn`, antes importado da API por
quatro telas web, agora fica em `packages/shared/date.ts`. A API reexporta a
função para preservar seus consumidores. A implementação e o resultado são os
mesmos; o frontend deixa de depender de fontes da API para compilar.
O material opcional Cloudflare não é executado pelo build da API ou pela Vercel;
seu empacotamento exige fornecer o build web revisado em `dist` primeiro.

Não exportar `.env` reais, `.data`, uploads reais, `.release-keys`, `.tools`,
node_modules, caches, logs, builds, instaladores ou sessões. O filtro de
credenciais bloqueia chaves privadas e tokens reconhecidos; não é um detector
universal de segredos. `.env.example` contém apenas instruções/placeholders.
O instalador antigo não deve entrar em Git: distribuir binários via Releases
após gerar e verificar uma versão atual, preservando licenças e assinaturas.

## Publicação web na Vercel

Context7 não estava disponível nesta sessão. Foram consultadas as fontes
oficiais: [Vite](https://vercel.com/docs/frameworks/frontend/vite) e
[rewrites externos e cache](https://vercel.com/docs/routing/rewrites).

Importar WEB-VERSION com raiz `.`, preset Vite e saída `dist`. A URL da API
persistente precisa existir antes da beta funcional. Execute no checkout web:

```sh
node scripts/configure-vercel.mjs https://HOST-REAL-DA-API
```

Esse comando gera `vercel.json` antes da importação/deploy, preserva os prefixos
`/api`, `/socket.io` e `/downloads/installers` e desliga cache das respostas
privadas. Revise o arquivo e faça commit. Não use um domínio fictício em produção.
O script recusa HTTP, credenciais na URL e caminhos extras. Não configure chaves
Supabase, LiveKit ou Mercado Pago em variáveis `VITE_*`.

Rewrites são preparação, não prova de funcionamento de WebSocket. Validar em
Preview login/cookies HttpOnly, Origin, logout/revogação, polling e upgrade do
Socket.IO, upload/download privado e Range do instalador. Se o caminho Socket.IO
não funcionar na borda escolhida, a beta colaborativa depende de uma borda
compatível ou adaptação explícita do transporte. Não relaxar autorização/CORS.

## API e limites da beta

A API atual usa um processo HTTP contínuo, Socket.IO, timers, JSON e uploads
locais. Não convertê-la diretamente em uma Function Vercel. Rodar API-HYVE em
host persistente, com volume para `DATA_DIR`, HTTPS, `HOST=0.0.0.0`,
`APP_ORIGIN` igual à URL pública exata da web e `SECURE_COOKIE=true`.
Não iniciar mais de uma instância sobre o JSON atual; escala requer adapter
compartilhado e coordenação. Nenhum plano pago foi contratado nesta preparação.

Bloqueios de lançamento que continuam explícitos:

- `#register` e a Home usam contas locais; `#central` usa Supabase e é um fluxo
  separado. Cadastro sem verificação de e-mail não é o aceite de identidade da
  beta pública. Recuperação de conta e dados reais precisam de validação.
- Chamadas remotas precisam de LiveKit gerenciado com WSS, credenciais próprias
  no servidor e teste em duas redes. O piloto local não prova esse aceite.
- Cobranças reais seguem bloqueadas. Não abrir gates de assinatura para testar
  a publicação do código.
- Exercitar backup/restauração, retenção, privacidade, arquivos privados,
  isolamento entre Studios e primeiro Studio com usuários reais antes do convite
  público. Não copiar bases locais para os repositórios.
- O instalador 0.2.1 é anterior às últimas alterações e tem feed de atualização
  loopback. A próxima release exige versão própria e feed HTTPS assinado.

Os controles JUR-02, JUR-05, JUR-08 e JUR-09 permanecem requisitos de engenharia;
esta revisão não declara conformidade jurídica ou certificação de segurança.
