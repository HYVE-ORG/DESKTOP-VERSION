-- Fixtures exclusivamente em transação revertida; não faz upload de bytes.
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('10000000-0000-4000-8000-000000000001','admin-a@work.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000002','coord@work.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000003','user@work.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000004','admin-b@work.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000005','none@work.invalid',now(),'authenticated','authenticated');
insert into auth.sessions(id,user_id) select ('20000000-0000-4000-8000-'||right(id::text,12))::uuid,id from auth.users where email like '%@work.invalid';
insert into forma.studios(id,name) values('30000000-0000-4000-8000-000000000001','Studio A'),('30000000-0000-4000-8000-000000000002','Studio B');
insert into forma.memberships(studio_id,account_id,role) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin'),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','coordinator'),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','user'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','admin');
insert into forma.upload_verifiers(id,secret) values('primary',repeat('f',64)) on conflict(id) do update set secret=excluded.secret;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare a uuid; p uuid; request uuid:=gen_random_uuid(); r jsonb; begin
 a:=(public.forma_work_action('30000000-0000-4000-8000-000000000001','workspace.create','{"name":"Design"}',request)->>'id')::uuid;
 if(public.forma_work_action('30000000-0000-4000-8000-000000000001','workspace.create','{"name":"Design"}',request)->>'id')::uuid<>a then raise exception 'Workspace retry duplicado'; end if;
 p:=(public.forma_work_action('30000000-0000-4000-8000-000000000001','project.create',jsonb_build_object('workspaceId',a,'name','Projeto A'),gen_random_uuid())->>'id')::uuid;
 perform set_config('test.area',a::text,true);perform set_config('test.project',p::text,true);
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','project.access',jsonb_build_object('projectId',p,'accountId','10000000-0000-4000-8000-000000000002','enabled',true),gen_random_uuid());
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','project.access',jsonb_build_object('projectId',p,'accountId','10000000-0000-4000-8000-000000000003','enabled',true),gen_random_uuid());
 if jsonb_array_length(public.forma_work_snapshot('30000000-0000-4000-8000-000000000001')->'projects')<>1 then raise exception 'Snapshot incorreto'; end if;
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','project.update',jsonb_build_object('id',p,'version',1,'name','Projeto A','description','','color','#6b815b','archived',true),gen_random_uuid());
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','project.update',jsonb_build_object('id',p,'version',2,'name','Projeto A','description','','color','#6b815b','archived',false),gen_random_uuid());
 begin
  perform public.forma_work_snapshot('30000000-0000-4000-8000-000000000002');raise exception 'Studio B vazou';
 exception when insufficient_privilege then null; end;
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','workspace.create','{"name":"Outro"}',request);raise exception 'requestId reutilizado com outro payload';
 exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare p uuid:=current_setting('test.project')::uuid;a uuid:=current_setting('test.area')::uuid;t uuid;r uuid:=gen_random_uuid();first_page jsonb;second_page jsonb; begin
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','project.create',jsonb_build_object('workspaceId',a,'name','Projeto privativo'),gen_random_uuid());
 t:=(public.forma_work_action('30000000-0000-4000-8000-000000000001','task.create',jsonb_build_object('projectId',p,'title','Entrega','assigneeIds',jsonb_build_array('10000000-0000-4000-8000-000000000003')),r)->>'id')::uuid;
 perform set_config('test.task',t::text,true);
 for counter in 1..51 loop
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','task.create',jsonb_build_object('projectId',p,'title','Tarefa paginada '||counter),gen_random_uuid());
 end loop;
 first_page:=public.forma_project_content(p);second_page:=public.forma_project_content(p,(first_page->'tasks'->49->>'id')::uuid);
 if jsonb_array_length(first_page->'tasks')<>50 or jsonb_array_length(second_page->'tasks')<>2 then raise exception 'Paginação perdeu tarefas';end if;
 if (first_page->'tasks'->0->>'id')::uuid < (first_page->'tasks'->49->>'id')::uuid then raise exception 'Ordenação de tarefas incorreta';end if;
 perform set_config('test.chat',(select id::text from forma.conversations where project_id=p limit 1),true);
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','workspace.create','{"name":"Indevido"}',gen_random_uuid());raise exception 'Coordenador criou área';
 exception when insufficient_privilege then null; end;
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','project.access',jsonb_build_object('projectId',p,'accountId','10000000-0000-4000-8000-000000000005','enabled',true),gen_random_uuid());raise exception 'Coordenador ampliou escopo';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare p uuid:=current_setting('test.project')::uuid;t uuid:=current_setting('test.task')::uuid;c uuid:=current_setting('test.chat')::uuid;
 r uuid:=gen_random_uuid();d uuid;f jsonb;proof text; begin
 if jsonb_array_length(public.forma_work_snapshot('30000000-0000-4000-8000-000000000001')->'projects')<>1 then raise exception 'Projeto privativo vazou'; end if;
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','task.move',jsonb_build_object('id',t,'version',1,'status','in_progress'),r);
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','task.move',jsonb_build_object('id',t,'version',1,'status','in_progress'),r);
 perform set_config('test.move_request',r::text,true);
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','task.move',jsonb_build_object('id',t,'version',1,'status','done'),gen_random_uuid());raise exception 'Versão obsoleta aceita';
 exception when serialization_failure then null; end;
 begin
  update forma.tasks set title='Alteração indevida',version=version+1 where id=t;raise exception 'Usuário editou tarefa';
 exception when insufficient_privilege then null; end;
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','task.create',jsonb_build_object('projectId',p,'title','Indevida'),gen_random_uuid());raise exception 'Usuário criou tarefa';
 exception when insufficient_privilege then null; end;
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','message.send',jsonb_build_object('conversationId',c,'body','Olá, equipe <script>literal</script>'),gen_random_uuid());
 d:=(public.forma_work_action('30000000-0000-4000-8000-000000000001','document.save',jsonb_build_object('projectId',p,'title','Briefing','body','Versão 1'),gen_random_uuid())->>'id')::uuid;
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','document.save',jsonb_build_object('id',d,'projectId',p,'version',1,'title','Briefing','body','Versão 2'),gen_random_uuid());
 if public.forma_document_read(d,1)->'document'->>'body'<>'Versão 1' then raise exception 'Revisão perdida'; end if;
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','document.save',jsonb_build_object('id',d,'projectId',p,'version',1,'title','Briefing','body','Obsoleta'),gen_random_uuid());raise exception 'Documento sobrescrito';
 exception when serialization_failure then null; end;
 r:=gen_random_uuid();
 perform public.forma_upload_cancel('30000000-0000-4000-8000-000000000001',r,gen_random_uuid());
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','file.reserve',jsonb_build_object('projectId',p,'name','cancelado.ts','mime','text/plain; charset=utf-8','size',10,'sha256',repeat('a',64)),r);raise exception 'Reserva posterior a cancelamento aceita';
 exception when unique_violation then null;end;
 r:=gen_random_uuid();
 f:=public.forma_work_action('30000000-0000-4000-8000-000000000001','file.reserve',jsonb_build_object('projectId',p,'name','exemplo.ts','mime','text/plain; charset=utf-8','size',10,'sha256',repeat('a',64)),r);
 if public.forma_work_action('30000000-0000-4000-8000-000000000001','file.reserve',jsonb_build_object('projectId',p,'name','exemplo.ts','mime','text/plain; charset=utf-8','size',10,'sha256',repeat('a',64)),r)->>'id'<>f->>'id' then raise exception 'Reserva duplicada';end if;
 perform set_config('test.file',f->>'id',true);perform set_config('test.key',f->>'object_key',true);
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('forma-private',f->>'object_key',forma.actor_id()::text,'{"size":10,"mimetype":"text/plain"}');
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','file.finish',jsonb_build_object('id',f->>'id','proof',repeat('0',64)),gen_random_uuid());raise exception 'Prova forjada publicou arquivo';
 exception when insufficient_privilege then null; end;
 proof:=encode(extensions.hmac((f->>'id')||'|'||(f->>'uploader_id')||'|'||(f->>'sha256')||'|'||(f->>'size')||'|'||(f->>'mime'),repeat('f',64),'sha256'),'hex');
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','file.finish',jsonb_build_object('id',f->>'id','proof',proof),gen_random_uuid());
 if public.forma_file_read((f->>'id')::uuid)->>'status'<>'ready' then raise exception 'Arquivo não finalizou'; end if;
 if (select count(*) from storage.objects where name=f->>'object_key')<>1 then raise exception 'Objeto autorizado invisível'; end if;
 update storage.objects set metadata='{"size":9}' where name=f->>'object_key';
 if found then raise exception 'Objeto publicado substituível'; end if;
 begin
  perform public.forma_work_action('30000000-0000-4000-8000-000000000001','message.send',jsonb_build_object('conversationId',c,'body','Anexo errado','attachmentIds',jsonb_build_array(f->>'id')),gen_random_uuid());raise exception 'Arquivo de outro escopo anexado';
 exception when insufficient_privilege then null; end;
 -- Retirada lógica antes da limpeza física: tombstone também obedece revogação.
 perform public.forma_work_action('30000000-0000-4000-8000-000000000001','file.delete',jsonb_build_object('id',f->>'id'),gen_random_uuid());
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.forma_work_action('30000000-0000-4000-8000-000000000001','project.access',jsonb_build_object('projectId',current_setting('test.project'),'accountId','10000000-0000-4000-8000-000000000003','enabled',false),gen_random_uuid());
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from storage.objects where name=current_setting('test.key'))<>0 then raise exception 'Storage após revogação vazou'; end if;
 begin perform public.forma_file_read(current_setting('test.file')::uuid);raise exception 'Arquivo após revogação vazou';exception when no_data_found then null;end;
 begin perform public.forma_project_content(current_setting('test.project')::uuid);raise exception 'Projeto após revogação vazou';exception when insufficient_privilege then null;end;
 begin perform public.forma_work_action('30000000-0000-4000-8000-000000000001','task.move',jsonb_build_object('id',current_setting('test.task'),'version',1,'status','in_progress'),current_setting('test.move_request')::uuid);raise exception 'Retry ignorou revogação';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","session_id":"20000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.forma_work_snapshot('30000000-0000-4000-8000-000000000001');raise exception 'Conta sem Studio entrou';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.forma_work_snapshot('30000000-0000-4000-8000-000000000001');raise exception 'Anônimo entrou';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'central_work: OK (rollback)' as result;
