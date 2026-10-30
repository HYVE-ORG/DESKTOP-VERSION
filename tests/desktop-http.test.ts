import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/api/src/app';
test('API do desktop resolve assets explícitos e aceita sua porta dinâmica sem Studio automático',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'forma-desktop-api-'));let server:any;
    try {
        await writeFile(join(dir,'index.html'),'<h1>Fixture desktop</h1>');
        server=await createApp(join(dir,'data'),0,{host:'127.0.0.1',staticDir:dir});
        const origin=`http://127.0.0.1:${server.port}`;
        assert.match(await (await fetch(origin)).text(),/Fixture desktop/);
        const register=await fetch(origin+'/api/register',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Pessoa de teste',email:'desktop@test.local',password:'SenhaDesktopTeste2026'})});
        assert.equal(register.status,201);
        const cookie=register.headers.get('set-cookie')!.split(';')[0];
        const account=await (await fetch(origin+'/api/account',{headers:{cookie}})).json() as any;
        assert.equal(account.studios.length,0);
        assert.equal((await fetch(origin+'/api/setup',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{}'})).status,403);
    } finally {if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
