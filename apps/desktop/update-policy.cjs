const {verify,createHash}=require('node:crypto');
const {createReadStream}=require('node:fs');
function feedUrl(value){
 const u=new URL(value);
 if(!['https:','http:'].includes(u.protocol)||(u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/'))throw new Error('Origem de atualização inválida.');
 return u.href;
}
function versionParts(value){if(typeof value!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value))throw new Error('Versão de atualização inválida.');return value.split('.').map(Number);}
function isNewer(next,current){const a=versionParts(next),b=versionParts(current);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function verifyManifest(envelope,publicKey){
 const m=envelope?.manifest;
 if(!m||typeof envelope.signature!=='string'||!verify(null,Buffer.from(JSON.stringify(m)),publicKey,Buffer.from(envelope.signature,'base64')))throw new Error('Assinatura de atualização inválida.');
 versionParts(m.version);
 if(m.schema!==1||m.platform!=='win32'||m.arch!=='x64'||m.file!==`Forma-Setup-${m.version}-x64.exe`||!Number.isSafeInteger(m.size)||m.size<2||m.size>1_000_000_000||typeof m.sha512!=='string'||Buffer.from(m.sha512,'base64').length!==64||!Number.isFinite(Date.parse(m.releaseDate)))throw new Error('Manifesto de atualização inválido.');
 return m;
}
function matchInfo(info,m){
 const f=info?.files;
 if(info?.version!==m.version||!Array.isArray(f)||f.length!==1||f[0].url!==m.file||f[0].size!==m.size||f[0].sha512!==m.sha512||(info.path&&info.path!==m.file)||(info.sha512&&info.sha512!==m.sha512)||info.packages||info.isAdminRightsRequired||f[0].isAdminRightsRequired)throw new Error('Metadados de atualização divergentes.');
}
async function verifyFile(file,m){
 let size=0,header=Buffer.alloc(0);const hash=createHash('sha512');
 for await(const chunk of createReadStream(file)){if(!header.length)header=chunk.subarray(0,2);size+=chunk.length;if(size>m.size)throw new Error('Tamanho de atualização inválido.');hash.update(chunk);}
 if(size!==m.size||header.toString()!=='MZ'||hash.digest('base64')!==m.sha512)throw new Error('Integridade da atualização inválida.');
}
module.exports={feedUrl,verifyManifest,matchInfo,isNewer,verifyFile};
