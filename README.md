# DESKTOP-VERSION — Forma / HYVE beta

Fontes separadas do MVP para revisão da beta, sem credenciais ou dados reais.
Consulte o repositório HYVE-ORG/DOCS para o relatório e os limites de publicação.

Node 22.12+ (Node 24 recomendado). Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. O lockfile preserva o grafo completo já testado.

Aplicativo Electron único para todos os cargos. `npm run desktop` executa após o build. `npm run desktop:installer` gera instalador Windows. Renderer web e API embarcada são dependências necessárias, incluídas como snapshot; não são apps adicionais nem dependem de checkouts irmãos. Chaves privadas de assinatura não estão neste repositório.
