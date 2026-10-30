import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';

test('instalador é download público com bytes reais, range e sem fallback HTML',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-installer-'));let server:any;
 try{
  const downloads=join(dir,'downloads');await mkdir(downloads);await writeFile(join(downloads,'Forma-Setup-0.1.0-x64.exe'),Buffer.from('MZfixture-installer'));
  await writeFile(join(downloads,'.env'),'private');await writeFile(join(dir,'index.html'),'<h1>Landing</h1>');
  await writeFile(join(downloads,'latest.yml'),'{}');await writeFile(join(downloads,'release.json'),'{}');
  server=await createApp(join(dir,'data'),0,{staticDir:dir,downloadDir:downloads});const url=`http://127.0.0.1:${server.port}/downloads/installers/`;
  const response=await fetch(url+'Forma-Setup-0.1.0-x64.exe');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')||'',/attachment/);assert.equal(await response.text(),'MZfixture-installer');
  const range=await fetch(url+'Forma-Setup-0.1.0-x64.exe',{headers:{Range:'bytes=0-1'}});assert.equal(range.status,206);assert.equal(await range.text(),'MZ');
  for(const metadata of ['latest.yml','release.json'])assert.equal((await fetch(url+metadata)).headers.get('cache-control'),'no-store');
  assert.equal((await fetch(url+'missing.exe')).status,404);assert.equal((await fetch(url+'.env')).status,404);
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
