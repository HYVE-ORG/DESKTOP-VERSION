import { test } from 'node:test';import assert from 'node:assert/strict';
import { seedState } from '../apps/api/src/seed';import { execute } from '../apps/api/src/actions';
test('studio identity requires current version and an authorized image',()=>{
 const s=seedState('Admin','admin@test.local','hash',true),admin=s.users[0];
 const run=(payload:any)=>execute(s,admin.id,{type:'org.update',payload,requestId:crypto.randomUUID()});
 run({name:'Novo nome',description:'Descrição',version:1,bannerColor:'#cc8855'});
 assert.equal(s.orgs[0].version,2);assert.equal(s.orgs[0].bannerColor,'#cc8855');
 assert.throws(()=>run({name:'Antigo',description:'',version:1}));
 assert.throws(()=>run({name:'Outro',description:'',version:2,iconId:'foreign'}));
});
