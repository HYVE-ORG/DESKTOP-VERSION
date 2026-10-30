# Forma — Guia do desktop

Prévia local para Windows x64 · atualizado em 23/10/2026.

## Instalar pelo site

Na landing, selecione Baixar para Windows. O download direto entrega
Forma-Setup-0.2.1-x64.exe. Execute o arquivo: o instalador prepara o Forma
no usuário atual e cria atalhos na área de trabalho e no menu Iniciar.
Não precisa de Node.js. Abra o Forma pelo atalho após a instalação.

Esta prévia ainda não tem assinatura digital Windows. A atualização automática
está disponível na versão instalada, com servidor local ativo; veja abaixo.
Confirme a origem do download antes de executar. Instalações em máquinas
diferentes não compartilham dados nesta versão local.

Para desinstalar, use Aplicativos instalados no Windows. O perfil de dados
não é removido pelo desinstalador; preserve backup e solicite revisão
administrativa antes de eliminar os dados manualmente.

## Alternativa portátil

Peça à administração o ZIP da prévia Forma Desktop. Extraia toda a pasta e
execute Forma.exe, mantendo DLLs, locales e resources no mesmo lugar.
Não execute o binário de dentro do ZIP nem copie somente o .exe.
A máquina de destino não precisa de Node.js ou terminal.

É uma prévia local: cada computador guarda sua própria instalação.
Contas, convites e Studios de outro localhost não são sincronizados.
Nenhum dos pacotes inclui dados ou senhas da equipe.

## Dados e equipe

Os dados ficam em %APPDATA%\Forma\data. Perfil do navegador e aparência
ficam no perfil desktop %APPDATA%\Forma. Para backup, feche o aplicativo e
preserve todo esse perfil, inclusive data e uploads, em armazenamento protegido.

Cadastro pessoal começa sem Studio. Convites são recebidos na Inbox,
mas só entre contas da mesma instalação nesta prévia local.
A administração da plataforma continua responsável por criar o Studio;
ser Admin de equipe não permite criar novos Studios livremente.
Não há conta Admin ou senha universal embutida no pacote.

Existe apenas um aplicativo Forma para todos os cargos. A landing e o
download ficam somente no site; o desktop abre login/cadastro ou seu espaço.

Para preparar o primeiro Studio local, o operador autorizado abre o menu
Forma > Administração desta instalação (pressione Alt para ver o menu).
A operação ocorre na mesma janela e pausa a API local. Confirma a operação,
informa o e-mail de uma conta já cadastrada e o nome do Studio. A ferramenta
usa o runtime do pacote, sem instalar Node.js. Depois, seleciona Voltar ao
Forma e abre o Studio. Não há app ou atalho administrativo separado.
O operador é o usuário autenticado do Windows com escrita no perfil local;
esta ferramenta não é uma ação da API nem concede criação pública de Studios.

## Executar a partir do projeto

Para desenvolvimento e administração, use Node.js 22.12+ na pasta
outputs/software-mvp:

~~~powershell
npm ci
npm run build
npm run desktop
~~~

O aplicativo inicia seu próprio servidor em 127.0.0.1 numa porta livre;
não adota silenciosamente o servidor das portas 4100 ou 5173.
Os dados do desktop são separados de .data do ambiente web.

Para gerar uma nova pasta portátil e seu ZIP:

~~~powershell
npm run desktop:package
~~~

Para gerar o instalador e disponibilizá-lo no download local da landing:

~~~powershell
npm run desktop:installer
~~~

O instalador e seu SHA-256 ficam em release/downloads. Essa pasta é servida
pela API em /downloads/installers e não entra dentro do próprio aplicativo.

Os arquivos são criados em release, dentro do projeto. O processo usa o
Electron instalado, frontend/backend compilados e dependências de produção,
preservando as licenças. Não copia a base, .env, contas ou senhas da equipe.

## Janela e falhas

Uma segunda abertura foca a janela existente. O aplicativo conserva tamanho
e posição quando válidos; menus nativos de edição/zoom ficam disponíveis
pela tecla Alt. Fechar a janela encerra seu servidor local.

Se a inicialização falhar, a tela informa o problema e oferece tentar
novamente ou fechar. Não apague o perfil para contornar erro de dados:
preserve backup e peça revisão à administração. O log técnico desktop.log
fica no perfil, sem conteúdo de chats, propostas ou credenciais.

## Atualizações (a partir de 0.2.0)

Instale uma vez o novo instalador do site para habilitar o atualizador.
No aplicativo, pressione Alt > Atualizações > Verificar atualizações.
Aceite o download e depois use Instalar atualização e reiniciar quando terminar
seu trabalho. O app encerra seu servidor antes de abrir o instalador.

Atualizações automáticas vêm ativadas; o menu permite desativá-las.
Com elas ativas, a busca ocorre 15 segundos após abrir e a cada seis horas.
Uma versão validada é baixada em segundo plano e instalada ao fechar o Forma
normalmente. Desligamento do Windows não inicia a instalação. Não force o
encerramento durante uma instalação. O perfil local é preservado.

Nesta prévia, mantenha o servidor deste projeto ativo em localhost:5173.
Sem ele, o app continua funcionando e uma busca manual informa a falha.
Não há serviço remoto. Versões portáteis e de desenvolvimento usam o
instalador manualmente. O manifesto de release tem assinatura própria de
integridade; isso não é assinatura digital do executável pelo Windows.

## Outras limitações

Sem instalador assinado pelo Windows ou sincronização remota.
Chamadas remotas e compartilhamento de tela ainda dependem de integração de mídia;
câmera/microfone têm a prévia local já existente. Arquivos de código são
texto e não são executados. Não há e-mail externo ou recuperação automática
de senha. Distribuição pública exige revisão operacional, assinatura,
segurança e política de licenciamento do produto.
