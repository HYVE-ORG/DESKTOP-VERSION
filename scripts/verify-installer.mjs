import {execFileSync} from 'node:child_process';
import {readFile,mkdir,mkdtemp,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateDesktopBuild} from './package-desktop.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const report=JSON.parse(await readFile(join(root,'release/installer-output/installer-report.json'),'utf8'));
const installer=join(root,'release/downloads',report.file),bytes=await readFile(installer);
assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);
assert.equal(bytes.length,report.bytes);assert.equal(bytes.subarray(0,2).toString(),'MZ');
const cache=join(process.env.LOCALAPPDATA,'electron-builder/Cache/7zip@1.0.0');
const binaryFolder=(await readdir(cache)).find(name=>name.startsWith('7zip-win-x64-'));
assert.ok(binaryFolder,'Compile primeiro para obter a ferramenta 7zip do electron-builder.');
const sevenZip=join(cache,binaryFolder,'bin/7za.exe');
const base=resolve(root,'../../work/installer-smoke');await mkdir(base,{recursive:true});
const extracted=await mkdtemp(join(base,'payload-'));
execFileSync(sevenZip,['x',installer,'-o'+extracted,'-y','-bd','-bb0'],{windowsHide:true,stdio:'pipe',maxBuffer:1_000_000});
const manifest=JSON.parse(await readFile(join(extracted,'package-manifest.json'),'utf8'));
for(const entry of manifest.files){
 assert.ok(!entry.path.split('/').some(part=>part==='..'||part==='.data'||part.startsWith('.env')));
 const actual=await readFile(join(extracted,entry.path));
 assert.equal(createHash('sha256').update(actual).digest('hex'),entry.sha256,entry.path);
}
await validateDesktopBuild(join(extracted,'resources/app/dist'));
assert.ok(!manifest.files.some(entry=>entry.path.includes('Administrar-Studio.cmd')));
assert.ok(!manifest.files.some(entry=>/LandingPage|downloads\/installers/.test(entry.path)));
execFileSync(process.execPath,[join(root,'scripts/smoke-desktop.mjs'),join(extracted,'Forma.exe')],{cwd:root,windowsHide:true,stdio:'inherit'});
execFileSync(process.execPath,[join(root,'scripts/smoke-desktop-operator.mjs'),join(extracted,'Forma.exe')],{cwd:root,windowsHide:true,stdio:'inherit'});
console.log(JSON.stringify({pass:true,installer,extracted,verifiedFiles:manifest.files.length,sha256:report.sha256,limits:'Payload extraído; assistente de instalação/desinstalação não executado no Windows do usuário.'},null,2));
