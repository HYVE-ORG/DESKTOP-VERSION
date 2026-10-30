import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkAction,uploadProof,workOperationId} from '../apps/api/src/central-work';
import {CentralDomain} from '../apps/api/src/central-domain';
const studio='30000000-0000-4000-8000-000000000001',project='40000000-0000-4000-8000-000000000001';
test('ações centrais validam escopo/versão e recusam mass assignment/prova de upload do cliente',()=>{
 const requestId=crypto.randomUUID();
 assert.equal(parseWorkAction({type:'task.move',requestId,payload:{id:project,version:1,status:'done'}}).type,'task.move');
 assert.throws(()=>parseWorkAction({type:'task.move',requestId,payload:{id:project,version:1,status:'done',projectId:project}}));
 assert.throws(()=>parseWorkAction({type:'file.finish',requestId,payload:{id:project,proof:'forged'}}));
 assert.throws(()=>parseWorkAction({type:'task.create',requestId,payload:{projectId:project,title:'Task',assigneeIds:['other-studio'],status:'todo',description:'',priority:'medium',dueDate:''}}));
});
test('adapter de trabalho usa RPC fixa e conflito de versão vira409',async()=>{
 const calls:{url:string;body:any}[]=[];
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{calls.push({url,body:JSON.parse(options.body as string)});return Response.json({code:'40001'},{status:409});});
 await assert.rejects(domain.workAction('Bearer fixture-token',studio,'task.move',{id:project,version:1,status:'done'},crypto.randomUUID()),{status:409});
 assert.ok(calls[0].url.endsWith('/rest/v1/rpc/forma_work_action'));assert.equal(calls[0].body.p_studio,studio);
});
test('prova de inspeção vincula arquivo, autor e bytes e não é chave de Supabase',()=>{
 const file={id:project,uploader_id:studio,sha256:'a'.repeat(64),size:10,mime:'text/plain; charset=utf-8'};
 const secret='b'.repeat(64);const proof=uploadProof(secret,file);
 assert.match(proof,/^[0-9a-f]{64}$/);assert.notEqual(proof,uploadProof(secret,{...file,size:11}));
 assert.notEqual(proof,uploadProof(secret,{...file,id:studio}));assert.throws(()=>uploadProof('',file));
 const requestId=crypto.randomUUID();assert.equal(workOperationId(requestId,'finish'),workOperationId(requestId,'finish'));assert.notEqual(workOperationId(requestId,'finish'),workOperationId(requestId,'cancel'));
});
