import {cp,mkdir,mkdtemp,readFile,writeFile,rename,stat,lstat,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname,relative,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function copyRuntime(source,destination){
 for(const name of await readdir(source))await cp(join(source,name),join(destination,name),{recursive:true,force:false,errorOnExist:true});
}
export function productionDependencyDirs(base,paths){
 const modules=join(resolve(base),'node_modules')+sep;
 return [...new Set(paths.filter(p=>resolve(p)!==resolve(base)).map(p=>resolve(p)))].map(p=>{
  if(!p.startsWith(modules)||relative(base,p).split(sep).some(part=>part==='..'||part==='.data'))throw new Error('Dependência fora de node_modules: empacotamento interrompido.');
  return p;
 }).sort((a,b)=>a.length-b.length);
}
async function files(directory,prefix=''){
 const list=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const name=prefix?prefix+'/'+entry.name:entry.name;
  if(entry.isDirectory())list.push(...await files(join(directory,entry.name),name));
  else if(entry.isFile())list.push(name);
 }
 return list.sort();
}
export async function validateDesktopBuild(directory){
 if((await readdir(directory)).includes('downloads'))throw new Error('Downloads não podem entrar no desktop.');
 const names=await files(directory);
 if(!names.includes('index.html'))throw new Error('Build desktop ausente.');
 if(names.some(name=>/LandingPage|(^|\/)downloads\//i.test(name)))throw new Error('Landing/download não pode entrar no desktop.');
 for(const name of names.filter(name=>/\.(js|css)$/.test(name))){
  if((await readFile(join(directory,name),'utf8')).includes('lp-hero'))throw new Error('Landing detectada no build desktop.');
 }
}
export async function packageDesktop({archive=true}={}){
 if(process.platform!=='win32')throw new Error('Este empacotamento inicial requer Windows.');
 const meta=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 const electronRoot=join(root,'node_modules/electron/dist');
 for(const needed of ['dist-desktop/index.html','dist-api/desktop.cjs','apps/desktop/main.cjs','node_modules/electron/dist/electron.exe'])await stat(join(root,needed));
 await validateDesktopBuild(join(root,'dist-desktop'));
 const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 const graph=execFileSync(process.execPath,[npm,'ls','--omit=dev','--all','--parseable'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:5_000_000});
 const dependencies=productionDependencyDirs(root,graph.trim().split(/\r?\n/));
 const releases=join(root,'release');await mkdir(releases,{recursive:true});
 const destination=await mkdtemp(join(releases,`forma-desktop-${meta.version}-win32-${process.arch}-`));
 if(dirname(destination)!==releases)throw new Error('Destino de release inválido.');
 await copyRuntime(electronRoot,destination);
 await rename(join(destination,'electron.exe'),join(destination,'Forma.exe'));
 await rename(join(destination,'electron_wer.dll'),join(destination,'Forma_wer.dll'));
 const appRoot=join(destination,'resources/app');await mkdir(appRoot,{recursive:true});
 await writeFile(join(appRoot,'package.json'),JSON.stringify({name:'forma-desktop',productName:'Forma',version:meta.version,description:meta.description,main:'apps/desktop/main.cjs'},null,2));
 await cp(join(root,'dist-desktop'),join(appRoot,'dist'),{recursive:true,force:false,errorOnExist:true});
 await cp(join(root,'apps/desktop'),join(appRoot,'apps/desktop'),{recursive:true,force:false,errorOnExist:true});
 try{
  const trust=JSON.parse(await readFile(join(root,'apps/desktop/update-trust.json'),'utf8'));
  await writeFile(join(destination,'resources/app-update.yml'),JSON.stringify({provider:'generic',url:trust.url,publisherName:['Forma Ed25519 release'],updaterCacheDirName:'forma-updater'},null,2));
 }catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(join(appRoot,'dist-api'),{recursive:true});
 await cp(join(root,'dist-api/desktop.cjs'),join(appRoot,'dist-api/desktop.cjs'));
 await cp(join(root,'dist-api/operator.cjs'),join(appRoot,'dist-api/operator.cjs'));
 for(const dependency of dependencies){
  if((await lstat(dependency)).isSymbolicLink())throw new Error('Dependência vinculada externamente exige revisão antes de distribuir.');
  await cp(dependency,join(appRoot,relative(root,dependency)),{recursive:true,force:false,errorOnExist:true,filter:source=>{
   const rel=relative(dependency,source),parts=rel.split(sep);
   return !parts.includes('node_modules')&&!parts.includes('.git')&&!parts.includes('.data')&&!basename(source).startsWith('.env');
  }});
 }
 await writeFile(join(destination,'LEIA-ME.txt'),'Forma Desktop — prévia local para Windows\r\n\r\nExtraia toda a pasta e abra Forma.exe. Mantenha as DLLs e resources ao lado.\r\nNão precisa instalar Node.js.\r\n\r\nDados: %APPDATA%\\Forma\\data. Não são os dados de localhost:5173.\r\nCadastro começa sem Studio; criação continua restrita à administração da plataforma.\r\nAdministração local: no próprio Forma, pressione Alt e abra Forma > Administração desta instalação.\r\nCadastre a conta antes; o operador designa essa conta como Admin.\r\nFeche o aplicativo antes de copiar o perfil para backup.\r\nSem sincronização, assinatura de código ou atualização automática.\r\nPacote de teste local; não é release de produção.\r\n\r\nLicenças do runtime e dependências estão preservadas na pasta.\r\n');
 const names=await files(destination);
 if(names.some(n=>n.split('/').some(p=>p==='.data'||p==='.env'||p.startsWith('.env.'))))throw new Error('Arquivo privado no pacote. Distribuição interrompida.');
 const manifest={product:'Forma Desktop',version:meta.version,platform:process.platform,arch:process.arch,electron:JSON.parse(await readFile(join(root,'node_modules/electron/package.json'),'utf8')).version,generatedAt:new Date().toISOString(),files:[]};
 for(const name of names)manifest.files.push({path:name,sha256:createHash('sha256').update(await readFile(join(destination,name))).digest('hex')});
 await writeFile(join(destination,'package-manifest.json'),JSON.stringify(manifest,null,2));
 const zip=destination+'.zip';
 if(archive)execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath $env:FORMA_PACKAGE_DIRECTORY -DestinationPath $env:FORMA_PACKAGE_ZIP -CompressionLevel Fastest'],{windowsHide:true,env:{...process.env,FORMA_PACKAGE_DIRECTORY:destination,FORMA_PACKAGE_ZIP:zip},stdio:'pipe'});
 console.log(JSON.stringify({directory:destination,executable:join(destination,'Forma.exe'),zip:archive?zip:null,files:names.length,dependencies:dependencies.length},null,2));
 return destination;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await packageDesktop();
