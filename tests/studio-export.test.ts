import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportStudio,EXPORT_SECTIONS} from '../apps/api/src/studio-export';
const studio='30000000-0000-4000-8000-000000000001';
test('exportação percorre páginas, encerra com manifesto e revalida o Admin',async()=>{
 const calls:{section:string;after?:string}[]=[];
 const bytes=await exportStudio({exportPage:async(auth,id,section,after)=>{assert.equal(auth,'Bearer fixture');assert.equal(id,studio);calls.push({section,after});return {rows:section==='tasks'?[{key:after?'b':'a',record:{title:after?'Segunda':'Primeira'}}]:[],nextCursor:section==='tasks'&&!after?'a':null};}},'Bearer fixture',studio);
 const lines=bytes.toString('utf8').trim().split('\n').map(x=>JSON.parse(x));
 assert.equal(lines[0].type,'manifest');assert.equal(lines[0].studioId,studio);assert.equal(lines[0].attachmentsIncluded,false);
 assert.deepEqual(lines.filter(x=>x.section==='tasks').map(x=>x.record.title),['Primeira','Segunda']);
 assert.equal(lines.at(-1).type,'complete');assert.equal(lines.at(-1).counts.tasks,2);
 assert.equal(calls.at(-1)?.section,'studio');assert.equal(calls.length,EXPORT_SECTIONS.length+2);
});
test('exportação recusa limite e cursor repetido; nunca retorna conteúdo parcial',async()=>{
 await assert.rejects(exportStudio({exportPage:async()=>({rows:[{key:'a',record:{body:'a'.repeat(3000)}}],nextCursor:null})},'Bearer fixture',studio,{maxBytes:1024}),/limite/i);
 await assert.rejects(exportStudio({exportPage:async()=>({rows:[{key:'a',record:{}}],nextCursor:'a'})},'Bearer fixture',studio),/paginação/i);
 let calls=0;await assert.rejects(exportStudio({exportPage:async()=>{calls++;if(calls===2)throw Error('Acesso revogado');return {rows:[{key:'a',record:{}}],nextCursor:null};}},'Bearer fixture',studio),/revogado/);
});
test('cancelar interrompe a exportação antes de pedir outra página',async()=>{
 const cancel=new AbortController();cancel.abort();let calls=0;
 await assert.rejects(exportStudio({exportPage:async()=>{calls++;return {rows:[],nextCursor:null};}},'Bearer fixture',studio,{signal:cancel.signal}),/interrompida/);
 assert.equal(calls,0);
});
