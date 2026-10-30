-- Somente fixtures descartáveis, nenhuma conta/associação real.
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('11000000-0000-4000-8000-000000000001','admin@export.invalid',now(),'authenticated','authenticated'),
 ('11000000-0000-4000-8000-000000000002','coord@export.invalid',now(),'authenticated','authenticated'),
 ('11000000-0000-4000-8000-000000000003','user@export.invalid',now(),'authenticated','authenticated'),
 ('11000000-0000-4000-8000-000000000004','other@export.invalid',now(),'authenticated','authenticated');
insert into auth.sessions(id,user_id) select ('21000000-0000-4000-8000-'||right(id::text,12))::uuid,id from auth.users where email like '%@export.invalid';
insert into forma.profiles(account_id,name,handle,bio,location) values('11000000-0000-4000-8000-000000000001','Admin QA','export_qa','Bio não exportada','Local privado');
insert into forma.studios(id,name) values('31000000-0000-4000-8000-000000000001','Studio export QA'),('31000000-0000-4000-8000-000000000002','Outro Studio');
insert into forma.memberships(studio_id,account_id,role) values
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','admin'),
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','coordinator'),
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','user'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000004','admin');
insert into forma.workspaces(id,studio_id,name,archived) values
 ('41000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Área arquivada',true),
 ('41000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','Outra área',false);
insert into forma.projects(id,studio_id,workspace_id,name,created_by) values
 ('51000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Projeto QA','11000000-0000-4000-8000-000000000001'),
 ('51000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','Projeto alheio','11000000-0000-4000-8000-000000000004');
insert into forma.tasks(studio_id,project_id,title,created_by) select '31000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','Entrega '||n,'11000000-0000-4000-8000-000000000001' from generate_series(1,56) n;
insert into forma.tasks(studio_id,project_id,title,created_by) values('31000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002','SEGREDO OUTRA EMPRESA','11000000-0000-4000-8000-000000000004');
insert into forma.conversations(id,studio_id,workspace_id,name) values('61000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Chat QA');
insert into forma.messages(studio_id,conversation_id,author_id,body,deleted_at) values
 ('31000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Texto permitido',null),
 ('31000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','TEXTO APAGADO',now());
insert into forma.files(id,studio_id,project_id,uploader_id,name,mime,size,sha256,object_key,status) values('91000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','exemplo.ts','text/plain; charset=utf-8',10,repeat('a',64),'31000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000001','ready');
insert into forma_billing.checkouts(id,owner_id,company,payer_email,quote,terms_version,status,studio_id,coverage_end) select gen_random_uuid(),'11000000-0000-4000-8000-000000000001','Empresa QA','admin@export.invalid',quote,'qa','active','31000000-0000-4000-8000-000000000001',now()-interval '9 days' from forma_billing.plan_versions where plan_id='essential' and active;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","session_id":"21000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare page jsonb; cursor text; total integer:=0; section text; begin
 loop
  page:=public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','tasks',cursor);
  if page::text like '%SEGREDO OUTRA EMPRESA%' then raise exception 'Vazamento de Studio'; end if;
  total:=total+jsonb_array_length(page->'rows');cursor:=page->>'nextCursor';exit when cursor is null;
 end loop;
 if total<>56 then raise exception 'Paginação perdeu/duplicou tarefas: %',total;end if;
 foreach section in array array['studio','members','workspaces','workspace_access','projects','project_access','tasks','task_assignees','conversations','messages','documents','document_revisions','files','message_attachments'] loop
  page:=public.forma_studio_export_page('31000000-0000-4000-8000-000000000001',section);
  if page::text ~ 'object_key|payer_email|Bio não exportada|Local privado|TEXTO APAGADO' then raise exception 'Campo indevido: %',section;end if;
 end loop;
 page:=public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','workspaces');
 if page->'rows'->0->'record'->>'archived'<>'true' then raise exception 'Arquivado ausente';end if;
 begin perform public.forma_studio_export_page('31000000-0000-4000-8000-000000000002','studio');raise exception 'Outro Studio permitido';exception when insufficient_privilege then null;end;
 begin perform public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','audit');raise exception 'Seção técnica permitida';exception when invalid_parameter_value then null;end;
 begin perform public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','tasks','cursor adulterado');raise exception 'Cursor indevido';exception when invalid_parameter_value then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000002","session_id":"21000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin begin perform public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','studio');raise exception 'Coordenador permitido';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000003","session_id":"21000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin begin perform public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','studio');raise exception 'Usuário permitido';exception when insufficient_privilege then null;end;end $$;
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id='21000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","session_id":"21000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin begin perform public.forma_studio_export_page('31000000-0000-4000-8000-000000000001','studio');raise exception 'Sessão revogada permitida';exception when invalid_authorization_specification then null;end;end $$;
rollback;
