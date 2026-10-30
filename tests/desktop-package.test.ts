import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('build desktop rejeita landing e downloads de distribuição dentro do app',async()=>{
 const {validateDesktopBuild}=await import(pathToFileURL(resolve('scripts/package-desktop.mjs')).href);
 const dir=await mkdtemp(join(tmpdir(),'forma-desktop-build-'));
 try{
  await writeFile(join(dir,'index.html'),'<div id="root"></div>');await mkdir(join(dir,'assets'));await writeFile(join(dir,'assets/app.js'),'login');
  await validateDesktopBuild(dir);
  await writeFile(join(dir,'assets/LandingPage.js'),'marketing');await assert.rejects(validateDesktopBuild(dir),/landing/i);await rm(join(dir,'assets/LandingPage.js'));
  await mkdir(join(dir,'downloads'));await assert.rejects(validateDesktopBuild(dir),/download/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('empacotamento só aceita dependências da pasta node_modules do projeto',async()=>{
    const url=pathToFileURL(resolve('scripts/package-desktop.mjs')).href;
    const {productionDependencyDirs}=await import(url);
    const root=resolve('fixture');
    assert.deepEqual(productionDependencyDirs(root,[root,join(root,'node_modules/express'),join(root,'node_modules/express')]),[join(root,'node_modules/express')]);
    assert.throws(()=>productionDependencyDirs(root,[resolve('fora/segredo')]));
    assert.throws(()=>productionDependencyDirs(root,[join(root,'node_modules/.data')]));
});
test('runtime é copiado para destino novo já criado, preservando binário e licenças',async()=>{
 const {copyRuntime}=await import(pathToFileURL(resolve('scripts/package-desktop.mjs')).href);
 const dir=await mkdtemp(join(tmpdir(),'forma-package-'));
 try{const source=join(dir,'source'),destination=join(dir,'destination');await mkdir(source);await mkdir(destination);await writeFile(join(source,'LICENSE'),'License test');await writeFile(join(source,'electron.exe'),'Fixture');await copyRuntime(source,destination);assert.equal(await readFile(join(destination,'LICENSE'),'utf8'),'License test');assert.equal(await readFile(join(destination,'electron.exe'),'utf8'),'Fixture');}finally{await rm(dir,{recursive:true,force:true});}
});
