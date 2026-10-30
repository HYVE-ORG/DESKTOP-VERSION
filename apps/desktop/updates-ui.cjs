const fs=require('node:fs');
const path=require('node:path');
const {createUpdates}=require('./updates.cjs');
function automaticPreference(file){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value.automatic===true;}catch(error){return error.code==='ENOENT';}}
function createNativeUpdates({app,dialog,Menu,Notification,window,profile,ready,prepareInstall,disabled=false}){
 let updates,timer,interval,started=false,notice=false;const preference=path.join(profile,'updates.json');
 const automatic=automaticPreference(preference);
 try{
  const installed=JSON.parse(fs.readFileSync(path.join(process.resourcesPath,'forma-installed.json'),'utf8')).type==='nsis';
  if(app.isPackaged&&process.platform==='win32'&&process.arch==='x64'&&installed&&!disabled){
   const config=require('./update-trust.json');
   const {NsisUpdater}=require('electron-updater');
   updates=createUpdates({driver:new NsisUpdater(),version:app.getVersion(),config,automatic,
    saveAutomatic:value=>{fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(preference+'.tmp',JSON.stringify({automatic:value}));fs.renameSync(preference+'.tmp',preference);},
    onState:state=>{
     const item=Menu.getApplicationMenu()?.getMenuItemById('forma-update-install');if(item)item.enabled=state.status==='ready';
     if(state.status==='ready'&&!notice){notice=true;try{if(Notification.isSupported())new Notification({title:'Atualização do Forma pronta',body:`Versão ${state.nextVersion}. ${state.automatic?'Instale ao fechar ou use':'Use'} Instalar e reiniciar no menu.`}).show();}catch{}}
    }});
  }
 }catch{/* Unconfigured or portable builds keep the manual installer as their bootstrap path. */}
 const message=(text,type='info')=>dialog.showMessageBox(window(),{type,title:'Atualizações do Forma',message:text});
 async function install(){
  if(!updates||updates.getState().status!=='ready')return message('Nenhuma atualização pronta para instalar.');
  if(!ready())return message('Finalize a administração local ou aguarde a inicialização antes de atualizar.');
  const answer=await dialog.showMessageBox(window(),{type:'question',title:'Atualizações do Forma',message:'Reiniciar e instalar a atualização?',detail:'Conclua ou salve o que estiver editando. O perfil e os dados serão preservados.',buttons:['Depois','Reiniciar e instalar'],defaultId:0,cancelId:0});
  if(answer.response===1&&!await updates.install(prepareInstall))return message('Não foi possível iniciar a instalação. Tente verificar novamente.','error');
 }
 async function check(manual){
  if(!updates)return manual?message('Use a versão instalada para receber atualizações. Instale uma vez o novo instalador disponível no site.'):undefined;
  if(!ready())return manual?message('Aguarde o Forma ficar pronto e finalize a administração local.'):undefined;
  const state=await updates.check(manual,async manifest=>(await dialog.showMessageBox(window(),{type:'question',title:'Atualizações do Forma',message:`Versão ${manifest.version} disponível. Deseja baixar?`,detail:'Você pode continuar trabalhando durante o download.',buttons:['Agora não','Baixar atualização'],defaultId:1,cancelId:0})).response===1);
  if(!manual)return;
  if(state.status==='ready')return install();
  if(state.status==='current')return message(`Você já está na versão mais recente (${app.getVersion()}).`);
  if(state.status==='error')return message('Não foi possível obter uma atualização validada. Confira se o servidor local está ativo e tente novamente.','error');
  if(state.busy)return message('Uma verificação ou download já está em andamento.');
 }
 return {
  check:()=>check(true),
  menu:{label:'Atualizações',submenu:[
   {label:'Verificar atualizações',click:()=>{void check(true).catch(()=>{});}},
   {id:'forma-update-install',label:'Instalar atualização e reiniciar',enabled:false,click:()=>{void install().catch(()=>{});}},
   {label:'Atualizações automáticas',type:'checkbox',checked:automatic,enabled:!!updates,click:item=>{try{updates.setAutomatic(item.checked);if(item.checked)void check(false);}catch{item.checked=updates.getState().automatic;void message('Não foi possível salvar a preferência de atualização.','error');}}},
  ]},
  start(){if(started||!updates)return;started=true;timer=setTimeout(()=>{if(updates.getState().automatic)void check(false);},15000);interval=setInterval(()=>{if(updates.getState().automatic)void check(false);},6*60*60*1000);timer.unref();interval.unref();},
  beforeQuit:()=>updates?.beforeQuit(),
  skipInstallation:()=>updates?.skipInstallation(),
  stop(){clearTimeout(timer);clearInterval(interval);updates?.stop();}
 };
}
module.exports={createNativeUpdates,automaticPreference};
