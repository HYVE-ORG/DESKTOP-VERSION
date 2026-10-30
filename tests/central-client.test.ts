import {test} from 'node:test';
import assert from 'node:assert/strict';
import {centralRequest} from '../apps/web/src/central-api';

test('duas consultas centrais renovam uma vez, sem tokens no JavaScript',async()=>{
 const original=globalThis.fetch;let renewed=false,refreshes=0;const paths:string[]=[];
 globalThis.fetch=async(input,options)=>{
  const path=String(input);paths.push(path);assert.equal(options?.credentials,'include');
  if(path==='/api/central/refresh'){refreshes++;await new Promise(r=>setTimeout(r,15));renewed=true;return Response.json({ok:true});}
  return renewed?Response.json({studios:[]}):Response.json({message:'Sessão expirada'},{status:401});
 };
 try{
  const result=await Promise.all([centralRequest('/account'),centralRequest('/account')]);
  assert.deepEqual(result,[{studios:[]},{studios:[]}]);assert.equal(refreshes,1);
  assert.ok(paths.every(p=>p.startsWith('/api/central/')));
 }finally{globalThis.fetch=original;}
});
