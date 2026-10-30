const {feedUrl,verifyManifest,matchInfo,isNewer,verifyFile}=require('./update-policy.cjs');
async function readEnvelope(url,fetcher){
 const response=await fetcher(new URL('release.json',url),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Servidor de atualizações indisponível.');
 let text='',size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>65536)throw new Error('Manifesto de atualização muito grande.');text+=Buffer.from(chunk).toString('utf8');}
 return JSON.parse(text);
}
function createUpdates({driver,version,config,automatic=true,saveAutomatic=()=>{},fetcher=fetch,onState=()=>{}}){
 const url=feedUrl(config.url);let state={status:'idle',version,automatic},busy=false,closed=false,skipInstall=false,approved=null,pendingFile=null,cancellation;
 const set=patch=>{state={...state,...patch,automatic};onState({...state,busy});};
 driver.autoDownload=false;driver.autoInstallOnAppQuit=false;driver.allowDowngrade=false;driver.disableDifferentialDownload=true;driver.disableWebInstaller=true;
 driver.on('error',()=>{}); // All request failures are handled below; EventEmitter errors must have a listener.
 driver.on('download-progress',progress=>set({status:'downloading',percent:Math.round(progress.percent)}));
 driver.verifyUpdateCodeSignature=async(_names,file)=>{try{if(!approved)throw new Error('Sem manifesto aprovado.');await verifyFile(file,approved);return null;}catch(error){return error.message;}};
 return {
  getState:()=>({...state,busy}),
  setAutomatic(value){const next=value===true;saveAutomatic(next);automatic=next;if(!busy)driver.autoInstallOnAppQuit=!skipInstall&&automatic&&state.status==='ready';set({});},
  async check(manual=false,confirm=async()=>true){
   if(closed||busy||state.status==='ready')return {...state,busy};
   busy=true;set({status:'checking',error:undefined});
   try{
    const manifest=verifyManifest(await readEnvelope(url,fetcher),config.publicKey);
    if(!isNewer(manifest.version,version)){set({status:'current'});return {...state};}
    const result=await driver.checkForUpdates();if(closed)throw new Error('Verificação encerrada.');
    matchInfo(result?.updateInfo,manifest);cancellation=result.cancellationToken;approved=manifest;
    set({status:'available',nextVersion:manifest.version});
    if(manual&&!await confirm(manifest))return {...state};
    if(!manual&&!automatic)return {...state};
    // Register the updater's quit handler on success; the preference is restored before returning.
    driver.autoInstallOnAppQuit=true;set({status:'downloading',percent:0});
    const paths=await driver.downloadUpdate(cancellation);if(closed)throw new Error('Download encerrado.');
    if(!paths?.[0])throw new Error('Arquivo de atualização ausente.');
    await verifyFile(paths[0],manifest);pendingFile=paths[0];set({status:'ready',percent:100});
   }catch(error){approved=null;pendingFile=null;driver.autoInstallOnAppQuit=false;set({status:'error',error:error.message});}
   finally{busy=false;driver.autoInstallOnAppQuit=!closed&&!skipInstall&&automatic&&state.status==='ready';set({});}
   return {...state};
  },
  async install(prepare){
   if(busy||closed||skipInstall||state.status!=='ready'||!pendingFile||!approved)return false;
   try{await verifyFile(pendingFile,approved);if(!await prepare())return false;driver.quitAndInstall(false,true);return true;}
   catch(error){driver.autoInstallOnAppQuit=false;set({status:'error',error:error.message});return false;}
  },
  async beforeQuit(){
   if(state.status==='ready'&&automatic){try{await verifyFile(pendingFile,approved);}catch(error){driver.autoInstallOnAppQuit=false;set({status:'error',error:error.message});}}
  },
  skipInstallation(){skipInstall=true;driver.autoInstallOnAppQuit=false;},
  stop(){closed=true;if(busy){driver.autoInstallOnAppQuit=false;cancellation?.cancel();}}
 };
}
module.exports={createUpdates};
