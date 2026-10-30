import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
test('catálogo público expõe79/149, conta exige sessão e checkout segue fechado',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'forma-billing-http-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  server=await createApp(directory,0);const origin=`http://127.0.0.1:${server.port}`;
  const status=await fetch(origin+'/api/central/billing/status');assert.equal(status.status,200);const body=await status.json();assert.equal(body.checkoutEnabled,false);assert.deepEqual(body.plans.map((p:any)=>p.priceCents),[7900,14900]);
  assert.equal((await fetch(origin+'/api/central/billing/account')).status,401);
  assert.equal((await fetch(origin+'/api/central/billing/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(origin+'/api/central/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503);
 }finally{await server?.close();await rm(directory,{recursive:true,force:true});}
});
