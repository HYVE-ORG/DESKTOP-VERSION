import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../apps/api/src/store';
import type {StateStore} from '../apps/api/src/state-store';

test('contrato JSON aguarda transação assíncrona e recupera fila após rejeição',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'forma-contract-'));
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  const store:StateStore=new Store(directory);
  const transaction=store.transact(async state=>{
   await gate;state.orgs.push({id:'first',name:'Primeiro',description:''});return 'persistido';
  });
  const reading=store.read();
  release();assert.equal(await transaction,'persistido');
  assert.equal((await reading).orgs[0].id,'first');
  const before=await readFile(join(directory,'state.json'),'utf8');
  await assert.rejects(store.transact(async state=>{state.orgs.length=0;throw Error('cancelado');}),/cancelado/);
  assert.equal(await readFile(join(directory,'state.json'),'utf8'),before);
  await store.transact(state=>{state.orgs.push({id:'next',name:'Seguinte',description:''});});
  assert.deepEqual((await new Store(directory).read()).orgs.map(org=>org.id),['first','next']);
 }finally{release();await rm(directory,{recursive:true,force:true});}
});
