import {createHash,randomUUID} from 'node:crypto';
import {CentralDomain} from '../apps/api/src/central-domain';
import {uploadProof} from '../apps/api/src/central-work';
import {PUBLIC_PLANS} from '../packages/contracts/billing';
import type {OnlineSnapshot,OnlineTask,OnlineMessage,OnlineDocument,OnlineFile} from '../packages/contracts/central-work';
export const fixtureIds={studio:'30000000-0000-4000-8000-000000000001',workspace:'40000000-0000-4000-8000-000000000001',project:'50000000-0000-4000-8000-000000000001',actor:'10000000-0000-4000-8000-000000000001',chat:'60000000-0000-4000-8000-000000000001',areaChat:'60000000-0000-4000-8000-000000000002'};
export function onlineUiFixture(){
 const f=fixtureIds,time=()=>new Date().toISOString(),verifier='d'.repeat(64);
 const snapshot:OnlineSnapshot={actor_id:f.actor,studio:{id:f.studio,name:'Vexo · QA isolado',role:'admin'},workspaces:[{id:f.workspace,studio_id:f.studio,name:'Produto e Tecnologia',color:'#6b815b',version:1,archived:false}],projects:[{id:f.project,studio_id:f.studio,workspace_id:f.workspace,name:'Lançamento da beta',description:'Dados fictícios para verificar a interface. Nenhuma conta ou arquivo real.',color:'#6b815b',version:1,archived:false}],members:Array.from({length:23},(_,i)=>({account_id:i===0?f.actor:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:i===0?'Admin de teste':`Pessoa QA ${i+1}`,handle:i===0?'admin_teste':`qa_${i+1}`,role:i===0?'admin':'user'})),access:[],conversations:[{id:f.chat,studio_id:f.studio,workspace_id:f.workspace,project_id:f.project,name:'Projeto',archived:false},{id:f.areaChat,studio_id:f.studio,workspace_id:f.workspace,project_id:null,name:'Geral da área',archived:false}]};
 snapshot.access=snapshot.members.map(m=>({account_id:m.account_id,project_id:f.project,enabled:true}));
 const tasks:OnlineTask[]=Array.from({length:3},(_,i)=>({id:`70000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,studio_id:f.studio,project_id:f.project,title:['Organizar próximos passos','Revisar experiência da equipe','Preparar guia de boas-vindas'][i],description:'Uma entrega de exemplo para validar o trabalho online.',status:(['todo','in_progress','done'] as const)[i],priority:'medium',due_date:new Date().toISOString().slice(0,10),version:1,created_at:time(),updated_at:time(),assignee_ids:[f.actor]}));
 const documents:OnlineDocument[]=[{id:'80000000-0000-4000-8000-000000000001',studio_id:f.studio,project_id:f.project,title:'Guia da beta',body:'Este documento usa dados fictícios.\nA equipe mantém suas decisões no projeto.',version:1,updated_at:time(),updated_by:f.actor}];
 const revisions=new Map<string,OnlineDocument[]>(),files:OnlineFile[]=[],objects=new Map<string,Buffer>();
 const source=Buffer.from('export const forma = { online: true };\n// <script>não executar</script>\n');
 const sourceFile:OnlineFile={id:'90000000-0000-4000-8000-000000000001',studio_id:f.studio,project_id:f.project,conversation_id:null,uploader_id:f.actor,name:'exemplo.ts',mime:'text/plain; charset=utf-8',size:source.length,sha256:createHash('sha256').update(source).digest('hex'),object_key:`${f.studio}/90000000-0000-4000-8000-000000000001`,status:'ready',created_at:time(),expires_at:new Date(Date.now()+900000).toISOString()};files.push(sourceFile);objects.set(sourceFile.object_key,source);
 const messages:OnlineMessage[]=[{id:randomUUID(),studio_id:f.studio,conversation_id:f.chat,author_id:f.actor,body:'Este é o canal do projeto. A conversa da área fica separada.',version:1,created_at:time(),deleted_at:null,attachment_ids:[]},{id:randomUUID(),studio_id:f.studio,conversation_id:f.areaChat,author_id:f.actor,body:'Mensagem exclusiva da área, para testar o contexto.',version:1,created_at:time(),deleted_at:null,attachment_ids:[]}];
 const requests=new Map<string,{type:string;payload:string;result:any}>(),canceled=new Set<string>();
 const offers:any[]=[],support:any[]=[];const {id:_planId,name:_planName,...quote}=PUBLIC_PLANS[0];
 const billingCheckout={id:'a0000000-0000-4000-8000-000000000001',owner_id:f.actor,company:'Empresa QA fictícia',quote,status:'pending',provider_id:'fixture-sub',checkout_url:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=fixture-sub',studio_id:null,coverage_end:null,cancelled:false};
 const fail=(status:number,code:string)=>Response.json({code,message:'Falha fictícia controlada'},{status});
 const domain=new CentralDomain({url:'https://forma-fixture.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,init)=>{
  const path=new URL(url).pathname;
  if(path.startsWith('/auth/v1/token'))return Response.json({access_token:'fixture-online-access',refresh_token:'fixture-online-refresh',expires_in:3600});
  if(path.startsWith('/auth/v1/logout'))return new Response(null,{status:204});
  if(path.startsWith('/storage/v1/object/')){
   if(init.method==='DELETE'){const {prefixes}=JSON.parse(init.body as string);for(const key of prefixes)objects.delete(key);return Response.json([]);}
   const key=path.split('/forma-private/')[1];if(!key)return fail(404,'not_found');
   if(init.method==='POST'){if(objects.has(key))return fail(409,'Duplicate');objects.set(key,Buffer.from(init.body as Uint8Array));return Response.json({Key:key});}
   const bytes=objects.get(key);return bytes?new Response(new Uint8Array(bytes)):fail(404,'not_found');
  }
  const p=JSON.parse(init.body as string),rpc=path.split('/').at(-1);
  if(rpc==='forma_studio_export_page'){
   if(p.p_studio!==f.studio)return fail(403,'42501');
   await new Promise(resolve=>setTimeout(resolve,200)); // Somente QA: permite interromper um download em preparação.
   const content:Record<string,unknown[]>={studio:[snapshot.studio],members:snapshot.members,workspaces:snapshot.workspaces,projects:snapshot.projects,tasks,conversations:snapshot.conversations,messages:messages.filter(m=>!m.deleted_at),documents,files:files.filter(f=>f.status==='ready').map(({object_key,...file})=>file)};
   return Response.json({rows:(content[p.p_section]||[]).map((record,index)=>({key:String(index).padStart(8,'0'),record})),nextCursor:null});
  }
  if(rpc==='forma_account')return Response.json({profile:{account_id:f.actor,name:'Admin de teste',handle:'admin_teste',bio:'Conta fictícia de QA',title:'',location:''},studios:[{id:f.studio,name:snapshot.studio.name,role:'admin'}],invitations:[]});
  if(rpc==='forma_billing_plans')return Response.json(PUBLIC_PLANS);
  if(rpc==='forma_billing_account')return Response.json({operator:true,salesEnabled:false,checkouts:[billingCheckout],offers});
  if(rpc==='forma_billing_receipts')return Response.json({notice:'Registro fictício de QA; não é nota fiscal.',contracts:[billingCheckout],payments:[]});
  if(rpc==='forma_billing_requests')return Response.json(support);
  if(rpc==='forma_billing_request_create'){const item={id:randomUUID(),kind:p.p_kind,message:p.p_message,created_at:time(),status:'open',response:null};support.push(item);return Response.json(item);}
  if(rpc==='forma_billing_request_respond'){const item=support.find(x=>x.id===p.p_id);if(!item)return fail(404,'P0002');item.response=p.p_response;item.status='answered';return Response.json(item);}
  if(rpc==='forma_billing_server'){
   const e=JSON.parse(p.p_payload),d=e.data;
   if(e.operation==='lookup')return Response.json(billingCheckout);
   if(e.operation==='subscription.sync'){billingCheckout.cancelled=d.status==='cancelled';return Response.json({ok:true});}
   if(e.operation==='jobs.claim'||e.operation==='reconcile.list')return Response.json([]);
   if(e.operation==='offer.create'){if(d.supersedes){const old=offers.find(x=>x.id===d.supersedes);if(old)old.revoked_at=time();}const offer={id:randomUUID(),recipient_id:d.recipientId,name:d.name,quote:d.quote,expires_at:d.expiresAt,notes:d.notes,revoked_at:null};offers.push(offer);return Response.json(offer);}
   if(e.operation==='offer.revoke'){const offer=offers.find(x=>x.id===d.id);if(offer)offer.revoked_at=time();return Response.json({ok:true});}
   return fail(400,'22023');
  }
  if(rpc==='forma_work_snapshot')return Response.json(snapshot);
  if(rpc==='forma_project_content'){
   const list=tasks.filter(t=>t.project_id===p.p_project).slice().reverse(),offset=p.p_after?list.findIndex(t=>t.id===p.p_after)+1:0;
   return Response.json({tasks:list.slice(offset,offset+50),total_tasks:list.length,documents:documents.filter(d=>d.project_id===p.p_project).map(({body,...d})=>d),files:files.filter(x=>x.project_id===p.p_project&&x.status==='ready').map(({object_key,...x})=>x)});
  }
  if(rpc==='forma_conversation_messages')return Response.json({messages:messages.filter(m=>m.conversation_id===p.p_conversation).slice().reverse(),files:files.filter(x=>x.conversation_id===p.p_conversation&&x.status==='ready').map(({object_key,...x})=>x)});
  if(rpc==='forma_document_read'){const doc=documents.find(d=>d.id===p.p_id),history=revisions.get(p.p_id)||[];return doc?Response.json({document:p.p_version&&p.p_version!==doc.version?history.find(d=>d.version===p.p_version):doc,revisions:history.map(d=>({version:d.version,saved_at:d.updated_at,saved_by:d.updated_by}))}):fail(404,'P0002');}
  if(rpc==='forma_file_read')return files.some(x=>x.id===p.p_id)?Response.json(files.find(x=>x.id===p.p_id)):fail(404,'P0002');
  if(rpc==='forma_invite')return Response.json(randomUUID());
  if(rpc==='forma_upload_cancel'){
   canceled.add(p.p_request);const saved=requests.get(p.p_request),file=files.find(x=>x.id===saved?.result.id);if(file)file.status='deleted';return Response.json(file?{canceled:true,object_key:file.object_key}:{canceled:true});
  }
  if(rpc!=='forma_work_action')return fail(404,'P0002');
  const kind=p.p_kind,v=p.p_data,key=p.p_request,prior=requests.get(key),serialized=JSON.stringify(v);
  if(prior)return prior.type===kind&&prior.payload===serialized?Response.json(prior.result):fail(409,'23505');
  let result:any;
  if(kind==='workspace.create'){const w={id:randomUUID(),studio_id:f.studio,name:v.name,color:v.color,version:1,archived:false};snapshot.workspaces.push(w);snapshot.conversations.push({id:randomUUID(),studio_id:f.studio,workspace_id:w.id,project_id:null,name:'Geral',archived:false});result={id:w.id,version:1};}
  else if(kind==='workspace.update'||kind==='project.update'){const record=(kind==='workspace.update'?snapshot.workspaces:snapshot.projects).find(x=>x.id===v.id);if(!record||record.version!==v.version)return fail(409,'40001');Object.assign(record,v,{version:record.version+1});result={id:record.id,version:record.version};}
  else if(kind==='project.create'){const project={id:randomUUID(),studio_id:f.studio,workspace_id:v.workspaceId,name:v.name,description:v.description,color:v.color,version:1,archived:false};snapshot.projects.push(project);snapshot.conversations.push({id:randomUUID(),studio_id:f.studio,workspace_id:v.workspaceId,project_id:project.id,name:'Projeto',archived:false});result={id:project.id,version:1};}
  else if(kind==='project.access'){const record=snapshot.access.find(a=>a.project_id===v.projectId&&a.account_id===v.accountId);if(record)record.enabled=v.enabled;else snapshot.access.push({project_id:v.projectId,account_id:v.accountId,enabled:v.enabled});result={id:v.projectId};}
  else if(kind==='task.create'){const task:OnlineTask={id:randomUUID(),studio_id:f.studio,project_id:v.projectId,title:v.title,description:v.description,status:v.status,priority:v.priority,due_date:v.dueDate||null,assignee_ids:v.assigneeIds,created_at:time(),updated_at:time(),version:1};tasks.push(task);result={id:task.id,version:1};}
  else if(kind==='task.update'||kind==='task.move'){const task=tasks.find(t=>t.id===v.id);if(!task||task.version!==v.version)return fail(409,'40001');if(kind==='task.update')Object.assign(task,{title:v.title,description:v.description,priority:v.priority,due_date:v.dueDate||null,assignee_ids:v.assigneeIds});task.status=v.status;task.version++;task.updated_at=time();result={id:task.id,version:task.version};}
  else if(kind==='conversation.create'){const chat={id:randomUUID(),studio_id:f.studio,workspace_id:v.workspaceId,project_id:v.projectId,name:v.name,archived:false};snapshot.conversations.push(chat);result={id:chat.id};}
  else if(kind==='message.send'){await new Promise(resolve=>setTimeout(resolve,5000));const message={id:randomUUID(),studio_id:f.studio,conversation_id:v.conversationId,author_id:f.actor,body:v.body,attachment_ids:v.attachmentIds,created_at:time(),deleted_at:null,version:1};messages.push(message);result={id:message.id,version:1};}
  else if(kind==='message.update'||kind==='message.delete'){const message=messages.find(m=>m.id===v.id);if(!message||message.version!==v.version)return fail(409,'40001');message.body=kind==='message.delete'?'':v.body;message.version++;if(kind==='message.delete')message.deleted_at=time();result={id:message.id,version:message.version};}
  else if(kind==='document.save'){let doc=documents.find(d=>d.id===v.id);if(doc){if(doc.version!==v.version)return fail(409,'40001');const history=revisions.get(doc.id)||[];history.push({...doc});revisions.set(doc.id,history);Object.assign(doc,{title:v.title,body:v.body,version:doc.version+1,updated_at:time()});}else{doc={id:randomUUID(),studio_id:f.studio,project_id:v.projectId,title:v.title,body:v.body,version:1,updated_at:time(),updated_by:f.actor};documents.push(doc);}result={id:doc.id,version:doc.version};}
  else if(kind==='file.reserve'){if(canceled.has(key))return fail(409,'23505');const id=randomUUID(),file:OnlineFile={...v,id,studio_id:f.studio,project_id:v.projectId,conversation_id:v.conversationId,uploader_id:f.actor,object_key:`${f.studio}/${id}`,status:'pending',created_at:time(),expires_at:new Date(Date.now()+900000).toISOString()};files.push(file);result=file;}
  else if(kind==='file.finish'){const file=files.find(x=>x.id===v.id);if(!file||v.proof!==uploadProof(verifier,file))return fail(403,'42501');file.status='ready';result=file;}
  else if(kind==='file.delete'){const file=files.find(x=>x.id===v.id);if(!file)return fail(404,'P0002');file.status='deleted';result={id:file.id,object_key:file.object_key,status:'deleted'};}
  else return fail(400,'22023');
  requests.set(key,{type:kind,payload:serialized,result:structuredClone(result)});return Response.json(result);
 });
 return {domain,verifier,studioId:f.studio};
}
