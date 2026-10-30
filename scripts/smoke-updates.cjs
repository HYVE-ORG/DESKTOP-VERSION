// Exercises the real updater and installer download, with installation disabled.
const fs=require('node:fs/promises');
const path=require('node:path');
async function run(){
 const root=path.resolve(__dirname,'..');
 if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,windowsHide:true,stdio:'inherit'});
  const timer=setTimeout(()=>child.kill(),120000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}).finally(()=>clearTimeout(timer));
  if(code!==0)throw new Error('Smoke updater falhou: '+code);return;
 }
 const {app}=require('electron');
 const assert=require('node:assert/strict');
 const base=path.resolve(root,'../../work/update-smoke');await fs.mkdir(base,{recursive:true});
 const run=await fs.mkdtemp(path.join(base,'session-'));app.setPath('userData',path.join(run,'profile'));
 await app.whenReady();
 try{
  const resources=path.resolve(process.argv[2]||'');
  const packaged=path.join(resources,'app');
  const {createRequire}=require('node:module');const load=createRequire(path.join(packaged,'package.json'));
  const {NsisUpdater}=load('electron-updater');
  const {ElectronHttpExecutor}=load('electron-updater/out/electronHttpExecutor');
  let installed=false;
  const adapter={version:'0.1.1',name:'Forma',isPackaged:true,appUpdateConfigPath:path.join(resources,'app-update.yml'),userDataPath:path.join(run,'profile'),baseCachePath:run,whenReady:()=>app.whenReady(),onQuit:()=>{},quit:()=>{throw Error('Instalação proibida no smoke');},relaunch:()=>{throw Error('Reinício proibido no smoke');}};
  const driver=new NsisUpdater(null,adapter);driver.httpExecutor=new ElectronHttpExecutor(()=>{});
  driver.quitAndInstall=()=>{installed=true;throw Error('Instalação proibida no smoke');};
  const config=load('./apps/desktop/update-trust.json');
  const {createUpdates}=load('./apps/desktop/updates.cjs');
  let progress=false;const updates=createUpdates({driver,version:adapter.version,config,onState:state=>{if(state.status==='downloading'&&state.percent>0)progress=true;}});
  const state=await updates.check();assert.equal(state.status,'ready',JSON.stringify(state));assert.equal(driver.autoInstallOnAppQuit,true);
  await updates.beforeQuit();assert.equal(driver.autoInstallOnAppQuit,true);
  updates.setAutomatic(false);updates.stop();assert.equal(driver.autoInstallOnAppQuit,false);assert.equal(installed,false);
  const report={pass:true,from:adapter.version,to:state.nextVersion,progress,installed,isolatedProfile:run,feed:config.url};
  await fs.writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
