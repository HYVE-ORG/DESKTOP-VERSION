const {app,BrowserWindow,Menu,dialog,ipcMain,screen,Notification,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {desktopUrl,allowedNavigation,allowedCheckout,windowBounds,webPreferences,isStatusSender}=require('./runtime.cjs');
app.setName('Forma');app.setAppUserModelId('com.forma.desktop');
const root=path.resolve(__dirname,'../..');
const profile=process.env.FORMA_DESKTOP_PROFILE?path.resolve(process.env.FORMA_DESKTOP_PROFILE):path.join(app.getPath('appData'),'Forma');
app.setPath('userData',profile);
const statusFile=path.join(__dirname,'status.html'),statusUrl=pathToFileURL(statusFile).href;
let win,server,serverClosing,updatesUI,origin='',launchUrl='',starting=false,quitting=false,provisioning=false,operatorJob;
const smoke=process.argv.includes('--smoke-test'),report=process.env.FORMA_DESKTOP_SMOKE_REPORT;
let adminMode=false,operatorSmokeDone=false;
const uiDirectory=path.join(root,app.isPackaged?'dist':'dist-desktop');
const log=event=>{try{fs.mkdirSync(profile,{recursive:true});fs.appendFileSync(path.join(profile,'desktop.log'),new Date().toISOString()+' '+event+'\n');}catch{}};
function savedWindow(){try{return JSON.parse(fs.readFileSync(path.join(profile,'window.json'),'utf8'));}catch{return {};}}
function saveWindow(){if(!win||win.isDestroyed())return;try{fs.writeFileSync(path.join(profile,'window.json'),JSON.stringify({...win.getNormalBounds(),maximized:win.isMaximized()}));}catch{log('window-state-write-failed');}}
function statusSender(event){return !!win&&isStatusSender(event,win.webContents,statusUrl);}
function appSender(event){return !!win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&allowedNavigation(event.senderFrame?.url,origin);}
function savedAppearance(){try{const theme=JSON.parse(fs.readFileSync(path.join(profile,'appearance.json'),'utf8'));return ['light','dark','hybrid'].includes(theme)?theme:null;}catch{return null;}}
async function showStatus(state,message=''){if(!win||win.isDestroyed())return;await win.loadFile(statusFile,{query:{state,message}});if(!smoke)win.show();}
async function closeServer(){if(serverClosing)return serverClosing;const own=server;server=undefined;if(own){serverClosing=own.close();try{await serverClosing;}finally{serverClosing=undefined;}}}
async function openAdministration(){
 if(starting||quitting||adminMode||provisioning)return;
 adminMode=true;starting=true;origin='';
 try{await closeServer();await showStatus('admin');}
 catch(error){log('administration-open-failed');await showStatus('error','Não foi possível abrir a administração local. Tente voltar ao Forma.');}
 finally{starting=false;}
}
async function provisionLocal(input){
 if(!adminMode||starting||server||provisioning)return {ok:false,message:'Operação administrativa indisponível.'};
 provisioning=true;
 try{operatorJob=require('./admin.cjs').provision(profile,input);await operatorJob;return {ok:true,message:'Studio preparado. Volte ao Forma e selecione Meus Studios.'};}
 catch(error){return {ok:false,message:error.message||'Não foi possível preparar o Studio.'};}
 finally{provisioning=false;operatorJob=undefined;}
}
async function startup(){
 if(starting||quitting)return;starting=true;
 try{
  await showStatus('starting');await closeServer();
  const override=!app.isPackaged&&process.env.FORMA_DESKTOP_URL;
  if(override)launchUrl=desktopUrl(override);
  else{
   const entry=path.join(root,'dist-api','desktop.cjs');
   if(!fs.existsSync(entry)||!fs.existsSync(path.join(uiDirectory,'index.html')))throw new Error('Os arquivos do aplicativo não estão completos. No desenvolvimento, execute npm run build.');
   const {createApp}=require(entry);
   server=await createApp(path.join(profile,'data'),0,{host:'127.0.0.1',staticDir:uiDirectory});
   if(quitting){await closeServer();return;}
   await server.store.read();launchUrl='http://127.0.0.1:'+server.port+'/#home';
  }
  origin=new URL(launchUrl).origin;
  const response=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(10000)}),health=await response.json();
  if(!response.ok||health.mode!=='local'||typeof health.initialized!=='boolean')throw new Error('O servidor local não respondeu como uma instalação do Forma.');
  await win.loadURL(launchUrl);if(!smoke){win.show();updatesUI?.start();}log('ready');
  if(smoke){
   if(!report||!process.env.FORMA_DESKTOP_PROFILE)throw new Error('Smoke exige perfil e relatório isolados.');
   if(process.env.FORMA_DESKTOP_OPERATOR_SMOKE&&!operatorSmokeDone){
    starting=false;await openAdministration();
    if(server)throw new Error('API deve estar parada durante administração.');
    const result=await provisionLocal(JSON.parse(process.env.FORMA_DESKTOP_OPERATOR_SMOKE));
    if(!result.ok)throw new Error(result.message);
    operatorSmokeDone=true;adminMode=false;return await startup();
   }
   const p=win.webContents.getLastWebPreferences();
   fs.writeFileSync(report,JSON.stringify({ok:true,url:win.webContents.getURL(),port:server?.port,root,profile,appearance:savedAppearance(),unifiedAdministration:operatorSmokeDone,initialized:health.initialized,nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation,sandbox:p.sandbox,webSecurity:p.webSecurity}));app.quit();
  }
 }catch(error){
  log('startup-failed:'+(error.name||'Error'));await closeServer().catch(()=>{});
  if(smoke){if(report)fs.writeFileSync(report,JSON.stringify({ok:false,error:error.message}));app.exit(1);return;}
  await showStatus('error',error.message||'Não foi possível iniciar o Forma.');
 }finally{starting=false;}
}
function createWindow(){
 const saved=savedWindow(),bounds=windowBounds(saved,screen.getAllDisplays().map(d=>d.workArea));
 win=new BrowserWindow({...bounds,minWidth:Math.min(800,bounds.width),minHeight:Math.min(600,bounds.height),show:false,backgroundColor:'#f7f8f5',title:'Forma',autoHideMenuBar:true,webPreferences:{...webPreferences,preload:path.join(__dirname,'preload.cjs')}});
 if(saved.maximized===true)win.maximize();win.on('close',saveWindow);
 win.on('query-session-end',()=>updatesUI?.skipInstallation());
 win.on('session-end',()=>updatesUI?.skipInstallation());
 win.webContents.on('will-navigate',(event,destination)=>{if(!allowedNavigation(destination,origin))event.preventDefault();});
 win.webContents.on('will-redirect',(event,destination)=>{if(!allowedNavigation(destination,origin))event.preventDefault();});
 win.webContents.setWindowOpenHandler(details=>{if(allowedNavigation(win.webContents.getURL(),origin)&&allowedCheckout(details.url))void shell.openExternal(details.url).catch(()=>log('checkout-browser-unavailable'));return {action:'deny'};});win.webContents.on('will-attach-webview',event=>event.preventDefault());
 win.webContents.on('render-process-gone',()=>{log('renderer-gone');if(!quitting)showStatus('error','A interface foi interrompida. Tente iniciar novamente.').catch(()=>{});});
 win.webContents.on('did-fail-load',(_e,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3&&!starting&&!quitting)showStatus('error','A interface não carregou. Confira a instalação e tente novamente.').catch(()=>{});});
 const session=win.webContents.session;
 session.setPermissionRequestHandler((contents,permission,callback)=>{let trusted=false;try{trusted=new URL(contents.getURL()).origin===origin;}catch{}callback(trusted&&permission==='media');});
 session.setPermissionCheckHandler((contents,permission,requestOrigin)=>!!contents&&requestOrigin===origin&&permission==='media');
 session.on('will-download',(_event,item)=>{try{const u=new URL(item.getURL());if(u.origin!==origin||!u.pathname.startsWith('/api/files/'))item.cancel();}catch{item.cancel();}});
 updatesUI=require('./updates-ui.cjs').createNativeUpdates({app,dialog,Menu,Notification,window:()=>win,profile,disabled:smoke,
  ready:()=>!starting&&!quitting&&!adminMode&&!provisioning,
  prepareInstall:async()=>{if(starting||quitting||adminMode||provisioning)return false;starting=true;saveWindow();updatesUI.stop();try{await closeServer();quitting=true;return true;}finally{starting=false;}}
 });
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Forma',submenu:[{label:'Ir para Home',click:()=>{if(origin)win.loadURL(origin+'/#home');}},{label:'Administração desta instalação',click:()=>{void openAdministration();}},{type:'separator'},{role:'quit',label:'Sair'}]},
  {label:'Editar',submenu:[{role:'undo',label:'Desfazer'},{role:'redo',label:'Refazer'},{type:'separator'},{role:'cut',label:'Recortar'},{role:'copy',label:'Copiar'},{role:'paste',label:'Colar'},{role:'selectAll',label:'Selecionar tudo'}]},
  {label:'Visualizar',submenu:[{role:'reload',label:'Recarregar'},{role:'resetZoom',label:'Tamanho original'},{role:'zoomIn',label:'Aumentar'},{role:'zoomOut',label:'Diminuir'},{role:'togglefullscreen',label:'Tela cheia'},...(!app.isPackaged?[{role:'toggleDevTools',label:'Ferramentas de desenvolvimento'}]:[])]},
  updatesUI.menu,
  {label:'Ajuda',submenu:[{label:'Ajuda no Forma',click:()=>{if(origin)win.loadURL(origin+'/#support');}},{label:'Sobre o Forma',click:()=>dialog.showMessageBox(win,{type:'info',title:'Forma Desktop',message:'Forma Desktop '+app.getVersion(),detail:'Dados neste dispositivo. Atualizações manuais/automáticas na versão instalada; servidor local de atualizações necessário nesta prévia.'})}]},
 ]));
 ipcMain.handle('forma:retry',event=>{if(statusSender(event)&&!starting&&!provisioning){adminMode=false;void startup();return true;}return false;});
 ipcMain.on('forma:appearance:get',event=>{event.returnValue=appSender(event)?savedAppearance():null;});
 require('./update-request.cjs').registerUpdateRequest(ipcMain,appSender,()=>updatesUI.check());
 ipcMain.on('forma:appearance:set',(event,theme)=>{if(appSender(event)&&['light','dark','hybrid'].includes(theme)){try{fs.writeFileSync(path.join(profile,'appearance.json'),JSON.stringify(theme));}catch{log('appearance-write-failed');}}});
 ipcMain.handle('forma:quit',event=>{if(statusSender(event))app.quit();});
 ipcMain.handle('forma:provision',(event,input)=>statusSender(event)?provisionLocal(input):{ok:false,message:'Operação administrativa indisponível.'});
 void startup();
}
if(!app.requestSingleInstanceLock())app.exit(0);
else{app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});app.whenReady().then(createWindow).catch(error=>{log('fatal:'+error.name);if(adminMode)console.error(error.message);else dialog.showErrorBox('Forma','Não foi possível abrir o aplicativo. Preserve seus dados e verifique a instalação.');app.exit(1);});}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;saveWindow();updatesUI?.stop();Promise.resolve(operatorJob).catch(()=>{}).then(()=>updatesUI?.beforeQuit()).then(closeServer).catch(()=>log('server-close-failed')).finally(()=>app.quit());});
