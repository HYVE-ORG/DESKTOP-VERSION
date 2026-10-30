-- SELECT FOR SHARE exige UPDATE; o app não ganha permissão de editar cargos.
-- Helper privado só bloqueia/lê a associação do ator autenticado.
create function forma.lock_actor_studio(target uuid) returns text language plpgsql volatile security definer set search_path='' as $$
declare result text;
begin
 select role into result from forma.memberships where studio_id=target and account_id=forma.actor_id() and status='active' for share;
 return result;
end $$;
revoke all on function forma.lock_actor_studio(uuid) from public,anon;
grant execute on function forma.lock_actor_studio(uuid) to authenticated;

create or replace function public.forma_work_action(p_studio uuid,p_kind text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=forma.actor_id(); actor_role text; fingerprint text; prior forma.work_requests;
 target uuid; parent uuid; area uuid; person uuid; item_id uuid; item text; task_row forma.tasks; doc forma.documents;
 chat forma.conversations; file_row forma.files; result jsonb; expected integer;
begin
 if actor is null then raise sqlstate '28000'; end if;
 if p_request is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>150000 then raise invalid_parameter_value; end if;
 actor_role:=forma.lock_actor_studio(p_studio);
 if actor_role is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request::text,0));
 fingerprint:=encode(sha256(convert_to(p_kind||p_data::text,'UTF8')),'hex');
 select * into prior from forma.work_requests where account_id=actor and request_id=p_request;
 if found then
  if prior.studio_id<>p_studio or prior.kind<>p_kind or prior.fingerprint<>fingerprint then raise unique_violation; end if;
  -- Retry também precisa manter autorização atual ao recurso.
  if prior.result ? 'project_id' and not forma.can_project((prior.result->>'project_id')::uuid) then raise insufficient_privilege; end if;
  if prior.result ? 'conversation_id' and not forma.can_conversation((prior.result->>'conversation_id')::uuid) then raise insufficient_privilege; end if;
  return prior.result;
 end if;
 target:=(p_data->>'id')::uuid;parent:=(p_data->>'projectId')::uuid;expected:=(p_data->>'version')::integer;
 case p_kind
 when 'workspace.create' then
  target:=gen_random_uuid();
  insert into forma.workspaces(id,studio_id,name,color) values(target,p_studio,btrim(p_data->>'name'),coalesce(p_data->>'color','#6b815b'));
  insert into forma.conversations(studio_id,workspace_id,name) values(p_studio,target,'Geral');
  result:=jsonb_build_object('id',target,'version',1);
 when 'workspace.update' then
  update forma.workspaces set name=btrim(p_data->>'name'),color=p_data->>'color',archived=(p_data->>'archived')::boolean,version=version+1 where id=target and studio_id=p_studio and version=expected;
  if not found then raise sqlstate '40001'; end if;
  result:=jsonb_build_object('id',target,'version',expected+1);
 when 'project.create' then
  area:=(p_data->>'workspaceId')::uuid;target:=gen_random_uuid();
  if not exists(select 1 from forma.workspaces where id=area and studio_id=p_studio) then raise insufficient_privilege; end if;
  insert into forma.projects(id,studio_id,workspace_id,name,description,color,created_by) values(target,p_studio,area,btrim(p_data->>'name'),coalesce(p_data->>'description',''),coalesce(p_data->>'color','#6b815b'),actor);
  insert into forma.project_access(studio_id,project_id,account_id) values(p_studio,target,actor);
  insert into forma.conversations(studio_id,workspace_id,project_id,name) values(p_studio,area,target,'Projeto');
  result:=jsonb_build_object('id',target,'project_id',target,'version',1);
 when 'project.update' then
  update forma.projects set name=btrim(p_data->>'name'),description=p_data->>'description',color=p_data->>'color',archived=(p_data->>'archived')::boolean,version=version+1 where id=target and studio_id=p_studio and version=expected;
  if not found then raise sqlstate '40001'; end if;
  result:=jsonb_build_object('id',target,'project_id',target,'version',expected+1);
 when 'project.access' then
  if actor_role<>'admin' then raise insufficient_privilege; end if;
  person:=(p_data->>'accountId')::uuid;
  select workspace_id into area from forma.projects where id=parent and studio_id=p_studio;
  if not found or not exists(select 1 from forma.memberships where studio_id=p_studio and account_id=person and status='active') then raise insufficient_privilege; end if;
  if (p_data->>'enabled')::boolean then
   insert into forma.workspace_access(studio_id,workspace_id,account_id) values(p_studio,area,person) on conflict(workspace_id,account_id) do update set enabled=true;
  end if;
  insert into forma.project_access(studio_id,project_id,account_id,enabled) values(p_studio,parent,person,(p_data->>'enabled')::boolean) on conflict(project_id,account_id) do update set enabled=excluded.enabled;
  result:=jsonb_build_object('id',parent,'project_id',parent);
 when 'task.create' then
  target:=gen_random_uuid();
  insert into forma.tasks(id,studio_id,project_id,title,description,status,priority,due_date,created_by)
  values(target,p_studio,parent,btrim(p_data->>'title'),coalesce(p_data->>'description',''),coalesce(p_data->>'status','todo'),coalesce(p_data->>'priority','medium'),nullif(p_data->>'dueDate','')::date,actor);
  if jsonb_array_length(coalesce(p_data->'assigneeIds','[]'))>20 then raise invalid_parameter_value; end if;
  for item in select jsonb_array_elements_text(coalesce(p_data->'assigneeIds','[]')) loop
   insert into forma.task_assignees(studio_id,project_id,task_id,account_id) values(p_studio,parent,target,item::uuid) on conflict do nothing;
  end loop;
  result:=jsonb_build_object('id',target,'project_id',parent,'version',1);
 when 'task.update','task.move' then
  select * into task_row from forma.tasks where id=target and studio_id=p_studio for update;
  if not found then raise insufficient_privilege; end if;
  if task_row.version is distinct from expected then raise sqlstate '40001'; end if;
  if p_kind='task.move' then update forma.tasks set status=p_data->>'status',version=version+1,updated_at=now() where id=target;
  else
   if not forma.can_project(task_row.project_id,true) then raise insufficient_privilege; end if;
   update forma.tasks set title=btrim(p_data->>'title'),description=p_data->>'description',status=p_data->>'status',priority=p_data->>'priority',due_date=nullif(p_data->>'dueDate','')::date,version=version+1,updated_at=now() where id=target;
   if jsonb_array_length(p_data->'assigneeIds')>20 then raise invalid_parameter_value; end if;
   delete from forma.task_assignees where task_id=target;
   for item in select jsonb_array_elements_text(p_data->'assigneeIds') loop
    insert into forma.task_assignees(studio_id,project_id,task_id,account_id) values(p_studio,task_row.project_id,target,item::uuid) on conflict do nothing;
   end loop;
  end if;
  result:=jsonb_build_object('id',target,'project_id',task_row.project_id,'version',expected+1);
 when 'conversation.create' then
  area:=(p_data->>'workspaceId')::uuid;target:=gen_random_uuid();
  insert into forma.conversations(id,studio_id,workspace_id,project_id,name) values(target,p_studio,area,parent,btrim(p_data->>'name'));
  result:=jsonb_build_object('id',target,'conversation_id',target);
 when 'message.send' then
  parent:=(p_data->>'conversationId')::uuid;target:=gen_random_uuid();
  if char_length(btrim(coalesce(p_data->>'body','')))=0 and jsonb_array_length(coalesce(p_data->'attachmentIds','[]'))=0 then raise invalid_parameter_value; end if;
  insert into forma.messages(id,studio_id,conversation_id,author_id,body) values(target,p_studio,parent,actor,coalesce(p_data->>'body',''));
  if jsonb_array_length(coalesce(p_data->'attachmentIds','[]'))>10 then raise invalid_parameter_value; end if;
  for item in select jsonb_array_elements_text(coalesce(p_data->'attachmentIds','[]')) loop
   insert into forma.message_attachments(studio_id,conversation_id,message_id,file_id) values(p_studio,parent,target,item::uuid) on conflict do nothing;
  end loop;
  result:=jsonb_build_object('id',target,'conversation_id',parent,'version',1);
 when 'message.update','message.delete' then
  update forma.messages set body=case when p_kind='message.delete' then '' else p_data->>'body' end,version=version+1,edited_at=now(),deleted_at=case when p_kind='message.delete' then now() else null end
  where id=target and studio_id=p_studio and version=expected and deleted_at is null returning conversation_id into parent;
  if not found then raise sqlstate '40001'; end if;
  result:=jsonb_build_object('id',target,'conversation_id',parent,'version',expected+1);
 when 'document.save' then
  if target is null then
   target:=gen_random_uuid();
   insert into forma.documents(id,studio_id,project_id,title,body,updated_by) values(target,p_studio,parent,btrim(p_data->>'title'),p_data->>'body',actor);
   result:=jsonb_build_object('id',target,'project_id',parent,'version',1);
  else
   select * into doc from forma.documents where id=target and studio_id=p_studio and project_id=parent for update;
   if not found then raise insufficient_privilege; end if;
   if doc.version is distinct from expected then raise sqlstate '40001'; end if;
   insert into forma.document_revisions(studio_id,project_id,document_id,version,title,body,saved_by,saved_at) values(p_studio,parent,target,doc.version,doc.title,doc.body,doc.updated_by,doc.updated_at);
   update forma.documents set title=btrim(p_data->>'title'),body=p_data->>'body',version=version+1,updated_at=now(),updated_by=actor where id=target;
   result:=jsonb_build_object('id',target,'project_id',parent,'version',expected+1);
  end if;
 when 'file.reserve' then
  target:=gen_random_uuid();item_id:=(p_data->>'conversationId')::uuid;
  insert into forma.files(id,studio_id,project_id,conversation_id,uploader_id,name,mime,size,sha256,object_key)
  values(target,p_studio,parent,item_id,actor,p_data->>'name',p_data->>'mime',(p_data->>'size')::integer,p_data->>'sha256',p_studio::text||'/'||target::text);
  result:=public.forma_file_read(target);
 when 'file.finish' then
  -- Prova de inspeção validada pela policy adicionada no incremento Storage.
  perform set_config('forma.upload_proof',coalesce(p_data->>'proof',''),true);
  update forma.files set status='ready' where id=target and studio_id=p_studio and uploader_id=actor and status='pending' and expires_at>now();
  if not found then raise insufficient_privilege; end if;
  result:=public.forma_file_read(target);
 when 'file.delete' then
  select * into file_row from forma.files where id=target and studio_id=p_studio for update;
  if not found then raise insufficient_privilege; end if;
  update forma.files set status='deleted' where id=target;
  result:=jsonb_build_object('id',target,'object_key',file_row.object_key,'status','deleted');
 else raise invalid_parameter_value;
 end case;
 delete from forma.work_requests where account_id=actor and created_at<now()-interval '30 days';
 insert into forma.work_requests(account_id,request_id,studio_id,kind,fingerprint,result) values(actor,p_request,p_studio,p_kind,fingerprint,result);
 return result;
end $$;


