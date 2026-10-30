import {generateKeyPairSync,createPublicKey,sign,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {feedUrl}=require('../apps/desktop/update-policy.cjs');
export async function releaseTrust(root){
 const configPath=join(root,'apps/desktop/update-trust.json'),keyPath=join(root,'.release-keys/private.pem');
 let config;try{config=JSON.parse(await readFile(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!config){
  const keys=generateKeyPairSync('ed25519');await mkdir(join(root,'.release-keys'),{recursive:true});
  await writeFile(keyPath,keys.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
  config={url:'http://127.0.0.1:5173/downloads/installers/',publicKey:keys.publicKey.export({type:'spki',format:'pem'})};
  await writeFile(configPath,JSON.stringify(config,null,2),{flag:'wx'});
 }
 feedUrl(config.url);const privateKey=await readFile(keyPath,'utf8');
 if(createPublicKey(privateKey).export({type:'spki',format:'pem'})!==config.publicKey)throw new Error('Chave de release divergente. Restaure a chave original; não gere outra para um app já distribuído.');
 return {config,privateKey};
}
async function atomic(path,body){await writeFile(path+'.tmp',body);await rename(path+'.tmp',path);}
export async function publishUpdateMetadata(root,trust,name,content,version){
 const directory=join(root,'release/downloads');
 const manifest={schema:1,version,platform:'win32',arch:'x64',file:name,size:content.length,sha512:createHash('sha512').update(content).digest('base64'),releaseDate:new Date().toISOString()};
 const signature=sign(null,Buffer.from(JSON.stringify(manifest)),trust.privateKey).toString('base64');
 const info={version,files:[{url:name,sha512:manifest.sha512,size:manifest.size}],path:name,sha512:manifest.sha512,releaseDate:manifest.releaseDate};
 await atomic(join(directory,'latest.yml'),JSON.stringify(info,null,2)); // JSON is a YAML subset understood by electron-updater.
 await atomic(join(directory,'release.json'),JSON.stringify({manifest,signature},null,2));
 return manifest;
}
