-- Domínio de trabalho: tabelas privadas, entidades relacionais, nenhum State blob.
create table forma.workspaces (
 id uuid primary key default gen_random_uuid(), studio_id uuid not null references forma.studios(id),
 name text not null check(char_length(btrim(name)) between 2 and 80),color text not null default '#6b815b' check(color ~ '^#[0-9a-fA-F]{6}$'),
 version integer not null default 1 check(version>0),archived boolean not null default false,
 unique(studio_id,id)
);
create table forma.workspace_access (
 studio_id uuid not null,workspace_id uuid not null,account_id uuid not null,enabled boolean not null default true,
 primary key(workspace_id,account_id),
 foreign key(studio_id,workspace_id) references forma.workspaces(studio_id,id),
 foreign key(studio_id,account_id) references forma.memberships(studio_id,account_id)
);
create table forma.projects (
 id uuid primary key default gen_random_uuid(),studio_id uuid not null,workspace_id uuid not null,
 name text not null check(char_length(btrim(name)) between 2 and 100),description text not null default '' check(char_length(description)<=4000),
 color text not null default '#6b815b' check(color ~ '^#[0-9a-fA-F]{6}$'),version integer not null default 1 check(version>0),archived boolean not null default false,
 created_by uuid not null,created_at timestamptz not null default now(),
 foreign key(studio_id,workspace_id) references forma.workspaces(studio_id,id),
 foreign key(studio_id,created_by) references forma.memberships(studio_id,account_id),
 unique(studio_id,id),unique(studio_id,workspace_id,id)
);
create table forma.project_access (
 studio_id uuid not null,project_id uuid not null,account_id uuid not null,enabled boolean not null default true,
 primary key(project_id,account_id),foreign key(studio_id,project_id) references forma.projects(studio_id,id),
 foreign key(studio_id,account_id) references forma.memberships(studio_id,account_id)
);
create table forma.tasks (
 id uuid primary key default gen_random_uuid(),studio_id uuid not null,project_id uuid not null,
 title text not null check(char_length(btrim(title)) between 2 and 160),description text not null default '' check(char_length(description)<=12000),
 status text not null default 'todo' check(status in ('todo','in_progress','in_review','done')),
 priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
 due_date date,version integer not null default 1 check(version>0),created_by uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(studio_id,project_id) references forma.projects(studio_id,id),foreign key(studio_id,created_by) references forma.memberships(studio_id,account_id),
 unique(studio_id,project_id,id)
);
create table forma.task_assignees (
 studio_id uuid not null,project_id uuid not null,task_id uuid not null,account_id uuid not null,
 primary key(task_id,account_id),foreign key(studio_id,project_id,task_id) references forma.tasks(studio_id,project_id,id),
 foreign key(studio_id,account_id) references forma.memberships(studio_id,account_id)
);
create table forma.conversations (
 id uuid primary key default gen_random_uuid(),studio_id uuid not null,workspace_id uuid not null,project_id uuid,
 name text not null check(char_length(btrim(name)) between 2 and 100),archived boolean not null default false,
 foreign key(studio_id,workspace_id) references forma.workspaces(studio_id,id),
 foreign key(studio_id,workspace_id,project_id) references forma.projects(studio_id,workspace_id,id),unique(studio_id,id)
);
create table forma.messages (
 id uuid primary key default gen_random_uuid(),studio_id uuid not null,conversation_id uuid not null,author_id uuid not null,
 body text not null check(char_length(body)<=12000),version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),edited_at timestamptz,deleted_at timestamptz,
 foreign key(studio_id,conversation_id) references forma.conversations(studio_id,id),foreign key(studio_id,author_id) references forma.memberships(studio_id,account_id),
 unique(studio_id,conversation_id,id)
);
create table forma.documents (
 id uuid primary key default gen_random_uuid(),studio_id uuid not null,project_id uuid not null,
 title text not null check(char_length(btrim(title)) between 2 and 160),body text not null default '' check(char_length(body)<=100000),
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),updated_by uuid not null,
 foreign key(studio_id,project_id) references forma.projects(studio_id,id),foreign key(studio_id,updated_by) references forma.memberships(studio_id,account_id),unique(studio_id,project_id,id)
);
create table forma.document_revisions (
 studio_id uuid not null,project_id uuid not null,document_id uuid not null,version integer not null,
 title text not null,body text not null,saved_by uuid not null,saved_at timestamptz not null,
 primary key(document_id,version),foreign key(studio_id,project_id,document_id) references forma.documents(studio_id,project_id,id)
);
create table forma.files (
 id uuid primary key default gen_random_uuid(),studio_id uuid not null references forma.studios(id),project_id uuid,conversation_id uuid,
 uploader_id uuid not null,name text not null check(char_length(name) between 1 and 180 and name !~ '[\\/[:cntrl:]]'),
 mime text not null check(mime in ('image/png','image/jpeg','image/gif','image/webp','audio/wav','audio/ogg','audio/mpeg','audio/webm','video/webm','video/mp4','text/plain; charset=utf-8')),
 size integer not null check(size>0 and size<=15728640),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 object_key text not null unique,status text not null default 'pending' check(status in ('pending','ready','deleted')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 check((project_id is null)<>(conversation_id is null)),
 check(object_key=studio_id::text||'/'||id::text),
 foreign key(studio_id,project_id) references forma.projects(studio_id,id),foreign key(studio_id,conversation_id) references forma.conversations(studio_id,id),
 foreign key(studio_id,uploader_id) references forma.memberships(studio_id,account_id),unique(studio_id,id)
);
create table forma.message_attachments (
 studio_id uuid not null,conversation_id uuid not null,message_id uuid not null,file_id uuid not null,
 primary key(message_id,file_id),foreign key(studio_id,conversation_id,message_id) references forma.messages(studio_id,conversation_id,id),
 foreign key(studio_id,file_id) references forma.files(studio_id,id)
);
create table forma.work_requests (
 account_id uuid not null references auth.users(id),request_id uuid not null,studio_id uuid not null references forma.studios(id),
 kind text not null,fingerprint text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(account_id,request_id)
);
create table forma.upload_verifiers (id text primary key,secret text not null check(char_length(secret)>=64));
-- Nenhum segredo na migração; configuração operacional separada, fora dos pacotes.

create index workspace_access_account on forma.workspace_access(account_id,workspace_id) where enabled;
create index project_access_account on forma.project_access(account_id,project_id) where enabled;
create index projects_workspace on forma.projects(studio_id,workspace_id);
create index tasks_project on forma.tasks(studio_id,project_id,created_at);
create index task_assignees_account on forma.task_assignees(account_id,task_id);
create index conversations_scope on forma.conversations(studio_id,workspace_id,project_id);
create index messages_conversation on forma.messages(conversation_id,created_at,id);
create index documents_project on forma.documents(studio_id,project_id);
create index files_scope on forma.files(studio_id,project_id,conversation_id,status);
create index message_attachments_file on forma.message_attachments(file_id);
create index work_requests_retention on forma.work_requests(created_at);

create function forma.can_workspace(target uuid,manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.workspaces w join forma.memberships m on m.studio_id=w.studio_id
 where w.id=target and m.account_id=forma.actor_id() and m.status='active'
 and (not manage or not w.archived and m.role<>'user')
 and (m.role='admin' or exists(select 1 from forma.workspace_access a where a.workspace_id=w.id and a.account_id=m.account_id and a.enabled)))
$$;
create function forma.project_allowed(target uuid,person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select forma.actor_id() is not null and exists(select 1 from forma.projects p join forma.memberships m on m.studio_id=p.studio_id
 where p.id=target and m.account_id=person and m.status='active'
 and (m.role='admin' or exists(select 1 from forma.project_access a join forma.workspace_access w on w.studio_id=a.studio_id and w.account_id=a.account_id
 where a.project_id=p.id and a.account_id=person and a.enabled and w.workspace_id=p.workspace_id and w.enabled)))
$$;
create function forma.can_project(target uuid,manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select forma.project_allowed(target,forma.actor_id()) and exists(select 1 from forma.projects p join forma.workspaces w on w.id=p.workspace_id
 where p.id=target and (not manage or not p.archived and not w.archived and forma.studio_role(p.studio_id)<>'user'))
$$;
create function forma.can_write_project(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select forma.can_project(target) and exists(select 1 from forma.projects p join forma.workspaces w on w.id=p.workspace_id where p.id=target and not p.archived and not w.archived)
$$;
create function forma.can_conversation(target uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.conversations c where c.id=target
 and (not write_access or not c.archived)
 and case when c.project_id is not null then case when write_access then forma.can_write_project(c.project_id) else forma.can_project(c.project_id) end
 else forma.can_workspace(c.workspace_id) and (not write_access or exists(select 1 from forma.workspaces w where w.id=c.workspace_id and not w.archived)) end)
$$;
create function forma.manage_conversation(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.conversations c where c.id=target and not c.archived
 and case when c.project_id is null then forma.can_workspace(c.workspace_id,true) else forma.can_project(c.project_id,true) end)
$$;
create function forma.can_move_task(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.tasks t where t.id=target and forma.can_write_project(t.project_id)
 and (forma.can_project(t.project_id,true) or exists(select 1 from forma.task_assignees a where a.task_id=t.id and a.account_id=forma.actor_id())))
$$;
create function forma.can_file_scope(project uuid,conversation uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select case when project is not null then case when write_access then forma.can_write_project(project) else forma.can_project(project) end
 when conversation is not null then forma.can_conversation(conversation,write_access) else false end
$$;
create function forma.file_readable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.files f where f.id=target and f.status<>'deleted' and forma.can_file_scope(f.project_id,f.conversation_id)
 and (f.status='ready' and (f.project_id is not null or f.uploader_id=forma.actor_id() or forma.studio_role(f.studio_id)='admin'
 or exists(select 1 from forma.message_attachments a join forma.messages m on m.id=a.message_id where a.file_id=f.id and m.deleted_at is null))
 or f.status='pending' and f.expires_at>now() and f.uploader_id=forma.actor_id()))
$$;

-- Helpers privados: autenticação é conferida dentro das consultas. Sem DML.
revoke all on function forma.can_workspace(uuid,boolean),forma.project_allowed(uuid,uuid),forma.can_project(uuid,boolean),forma.can_write_project(uuid),forma.can_conversation(uuid,boolean),forma.manage_conversation(uuid),forma.can_move_task(uuid),forma.can_file_scope(uuid,uuid,boolean),forma.file_readable(uuid) from public,anon;
grant execute on function forma.can_workspace(uuid,boolean),forma.project_allowed(uuid,uuid),forma.can_project(uuid,boolean),forma.can_write_project(uuid),forma.can_conversation(uuid,boolean),forma.manage_conversation(uuid),forma.can_move_task(uuid),forma.can_file_scope(uuid,uuid,boolean),forma.file_readable(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['workspaces','workspace_access','projects','project_access','tasks','task_assignees','conversations','messages','documents','document_revisions','files','message_attachments','work_requests','upload_verifiers'] loop
  execute format('alter table forma.%I enable row level security',t);
  execute format('alter table forma.%I force row level security',t);
 end loop;
end $$;
grant select,insert on forma.workspaces,forma.workspace_access,forma.projects,forma.project_access,forma.tasks,forma.task_assignees,forma.conversations,forma.messages,forma.documents,forma.document_revisions,forma.files,forma.message_attachments,forma.work_requests to authenticated;
grant update(name,color,version,archived) on forma.workspaces to authenticated;
grant update(name,description,color,version,archived) on forma.projects to authenticated;
grant update(enabled) on forma.workspace_access,forma.project_access to authenticated;
grant update(title,description,status,priority,due_date,version,updated_at) on forma.tasks to authenticated;
grant delete on forma.task_assignees to authenticated;
grant update(name,archived) on forma.conversations to authenticated;
grant update(body,version,edited_at,deleted_at) on forma.messages to authenticated;
grant update(title,body,version,updated_at,updated_by) on forma.documents to authenticated;
grant update(status) on forma.files to authenticated;
grant delete on forma.work_requests to authenticated;

create policy workspaces_read on forma.workspaces for select to authenticated using(forma.can_workspace(id));
create policy workspaces_insert on forma.workspaces for insert to authenticated with check(forma.studio_role(studio_id)='admin');
create policy workspaces_update on forma.workspaces for update to authenticated using(forma.studio_role(studio_id)='admin') with check(forma.studio_role(studio_id)='admin');
create policy workspace_access_read on forma.workspace_access for select to authenticated using(forma.can_workspace(workspace_id));
create policy workspace_access_insert on forma.workspace_access for insert to authenticated with check(forma.studio_role(studio_id)='admin');
create policy workspace_access_update on forma.workspace_access for update to authenticated using(forma.studio_role(studio_id)='admin') with check(forma.studio_role(studio_id)='admin');
create policy projects_read on forma.projects for select to authenticated using(forma.can_project(id));
-- Criador pode ler projeto novo antes de receber a associação na mesma transação.
create function forma.new_project_access(target uuid,person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select person=forma.actor_id() and exists(select 1 from forma.projects p where p.id=target and p.created_by=forma.actor_id()
 and p.created_at=transaction_timestamp() and forma.can_workspace(p.workspace_id,true))
$$;
revoke all on function forma.new_project_access(uuid,uuid) from public,anon;
grant execute on function forma.new_project_access(uuid,uuid) to authenticated;
create policy projects_insert on forma.projects for insert to authenticated with check(created_by=forma.actor_id() and forma.can_workspace(workspace_id,true));
create policy projects_update on forma.projects for update to authenticated using(forma.can_project(id,true)) with check(forma.can_project(id,true));
create policy project_access_read on forma.project_access for select to authenticated using(forma.can_project(project_id));
create policy project_access_insert on forma.project_access for insert to authenticated with check(
 forma.studio_role(studio_id)='admin' or forma.new_project_access(project_id,account_id));
create policy project_access_update on forma.project_access for update to authenticated using(forma.studio_role(studio_id)='admin') with check(forma.studio_role(studio_id)='admin');
create policy tasks_read on forma.tasks for select to authenticated using(forma.can_project(project_id));
create policy tasks_insert on forma.tasks for insert to authenticated with check(created_by=forma.actor_id() and forma.can_project(project_id,true));
create policy tasks_update on forma.tasks for update to authenticated using(forma.can_move_task(id)) with check(forma.can_move_task(id));
create policy assignees_read on forma.task_assignees for select to authenticated using(forma.can_project(project_id));
create policy assignees_insert on forma.task_assignees for insert to authenticated with check(forma.can_project(project_id,true) and forma.project_allowed(project_id,account_id));
create policy assignees_delete on forma.task_assignees for delete to authenticated using(forma.can_project(project_id,true));
create policy conversations_read on forma.conversations for select to authenticated using(forma.can_conversation(id));
create policy conversations_insert on forma.conversations for insert to authenticated with check(case when project_id is null then forma.can_workspace(workspace_id,true) else forma.can_project(project_id,true) end);
create policy conversations_update on forma.conversations for update to authenticated using(forma.manage_conversation(id)) with check(forma.manage_conversation(id));
create policy messages_read on forma.messages for select to authenticated using(forma.can_conversation(conversation_id));
create policy messages_insert on forma.messages for insert to authenticated with check(author_id=forma.actor_id() and forma.can_conversation(conversation_id,true));
create policy messages_update on forma.messages for update to authenticated using(forma.can_conversation(conversation_id,true) and (author_id=forma.actor_id() or forma.manage_conversation(conversation_id))) with check(forma.can_conversation(conversation_id,true) and (author_id=forma.actor_id() or forma.manage_conversation(conversation_id)));
create policy documents_read on forma.documents for select to authenticated using(forma.can_project(project_id));
create policy documents_insert on forma.documents for insert to authenticated with check(updated_by=forma.actor_id() and forma.can_write_project(project_id));
create policy documents_update on forma.documents for update to authenticated using(forma.can_write_project(project_id)) with check(updated_by=forma.actor_id() and forma.can_write_project(project_id));
create policy revisions_read on forma.document_revisions for select to authenticated using(forma.can_project(project_id));
create policy revisions_insert on forma.document_revisions for insert to authenticated with check(forma.can_write_project(project_id));
create policy files_read on forma.files for select to authenticated using(forma.file_readable(id) or uploader_id=forma.actor_id() and status in ('pending','deleted'));
create policy files_insert on forma.files for insert to authenticated with check(uploader_id=forma.actor_id() and status='pending' and expires_at<=now()+interval '15 minutes' and forma.can_file_scope(project_id,conversation_id,true));
create policy files_update on forma.files for update to authenticated using(uploader_id=forma.actor_id() or case when project_id is not null then forma.can_project(project_id,true) else forma.manage_conversation(conversation_id) end)
 with check(uploader_id=forma.actor_id() or case when project_id is not null then forma.can_project(project_id,true) else forma.manage_conversation(conversation_id) end);
create policy attachments_read on forma.message_attachments for select to authenticated using(forma.can_conversation(conversation_id));
create policy attachments_insert on forma.message_attachments for insert to authenticated with check(forma.can_conversation(conversation_id,true) and exists(select 1 from forma.messages m where m.id=message_id and m.author_id=forma.actor_id() and m.deleted_at is null) and exists(select 1 from forma.files f where f.id=file_id and f.conversation_id=message_attachments.conversation_id and f.status='ready' and f.uploader_id=forma.actor_id()));
create policy requests_read on forma.work_requests for select to authenticated using(account_id=forma.actor_id());
create policy requests_insert on forma.work_requests for insert to authenticated with check(account_id=forma.actor_id() and forma.studio_role(studio_id) is not null);
create policy requests_delete on forma.work_requests for delete to authenticated using(account_id=forma.actor_id() and created_at<now()-interval '30 days');

create function forma.guard_task_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not forma.can_project(old.project_id,true) and (to_jsonb(new)-array['status','version','updated_at'])<>(to_jsonb(old)-array['status','version','updated_at']) then raise insufficient_privilege; end if;
 if new.version<>old.version+1 then raise sqlstate '40001' using message='Versão inválida.'; end if;
 return new;
end $$;
create trigger tasks_guard before update on forma.tasks for each row execute function forma.guard_task_update();
revoke all on function forma.guard_task_update() from public,anon;

create function public.forma_work_snapshot(p_studio uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=forma.actor_id(); role_name text:=forma.studio_role(p_studio);
begin
 if actor is null then raise sqlstate '28000'; end if;
 if role_name is null then raise insufficient_privilege; end if;
 return jsonb_build_object('actor_id',actor,'studio',(select jsonb_build_object('id',id,'name',name,'role',role_name) from forma.studios where id=p_studio),
 'workspaces',coalesce((select jsonb_agg(to_jsonb(w) order by w.name,w.id) from forma.workspaces w where w.studio_id=p_studio),'[]'),
 'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.name,p.id) from forma.projects p where p.studio_id=p_studio),'[]'),
 'members',coalesce((select jsonb_agg(jsonb_build_object('account_id',m.account_id,'name',coalesce(p.name,'Pessoa da equipe'),'handle',coalesce(p.handle,''),'role',m.role) order by p.name,m.account_id)
 from forma.memberships m left join forma.profiles p on p.account_id=m.account_id where m.studio_id=p_studio and m.status='active'),'[]'),
 'access',coalesce((select jsonb_agg(jsonb_build_object('project_id',a.project_id,'account_id',a.account_id,'enabled',a.enabled)) from forma.project_access a where a.studio_id=p_studio),'[]'),
 'conversations',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from forma.conversations c where c.studio_id=p_studio),'[]'));
end $$;

create function public.forma_project_content(p_project uuid,p_after uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cursor_at timestamptz;
begin
 if forma.actor_id() is null then raise sqlstate '28000'; end if;
 if not forma.can_project(p_project) then raise insufficient_privilege; end if;
 if p_after is not null then select created_at into cursor_at from forma.tasks where id=p_after and project_id=p_project;
  if not found then raise invalid_parameter_value; end if;
 end if;
 return jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('assignee_ids',coalesce((select jsonb_agg(a.account_id order by a.account_id) from forma.task_assignees a where a.task_id=t.id),'[]')) order by t.created_at,t.id)
 from(select * from forma.tasks where project_id=p_project and (p_after is null or (created_at,id)>(cursor_at,p_after)) order by created_at,id limit 50)t),'[]'),
 'total_tasks',(select count(*) from forma.tasks where project_id=p_project),
 'documents',coalesce((select jsonb_agg(to_jsonb(d)-'body' order by d.title,d.id) from forma.documents d where d.project_id=p_project),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(f)-'object_key' order by f.created_at desc,f.id) from forma.files f where f.project_id=p_project and f.status='ready'),'[]'));
end $$;

create function public.forma_conversation_messages(p_conversation uuid,p_before uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cursor_at timestamptz;
begin
 if forma.actor_id() is null then raise sqlstate '28000'; end if;
 if not forma.can_conversation(p_conversation) then raise insufficient_privilege; end if;
 if p_before is not null then select created_at into cursor_at from forma.messages where id=p_before and conversation_id=p_conversation;
  if not found then raise invalid_parameter_value; end if;
 end if;
 return jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('attachment_ids',case when m.deleted_at is null then coalesce((select jsonb_agg(a.file_id order by a.file_id) from forma.message_attachments a where a.message_id=m.id),'[]'::jsonb) else '[]'::jsonb end) order by m.created_at desc,m.id desc)
 from(select * from forma.messages where conversation_id=p_conversation and(p_before is null or(created_at,id)<(cursor_at,p_before)) order by created_at desc,id desc limit 50)m),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(f)-'object_key' order by f.created_at,f.id) from forma.files f where f.conversation_id=p_conversation and f.status='ready'),'[]'));
end $$;

create function public.forma_document_read(p_id uuid,p_version integer default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare doc forma.documents; result jsonb;
begin
 if forma.actor_id() is null then raise sqlstate '28000'; end if;
 select * into doc from forma.documents where id=p_id;
 if not found then raise sqlstate 'P0002'; end if;
 if p_version is null or p_version=doc.version then result:=to_jsonb(doc);
 else select to_jsonb(r) into result from forma.document_revisions r where document_id=p_id and version=p_version;
  if not found then raise sqlstate 'P0002'; end if;
 end if;
 return jsonb_build_object('document',result,'revisions',coalesce((select jsonb_agg(jsonb_build_object('version',version,'saved_at',saved_at,'saved_by',saved_by) order by version desc) from forma.document_revisions where document_id=p_id),'[]'));
end $$;
create function public.forma_file_read(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if forma.actor_id() is null then raise sqlstate '28000'; end if;
 select to_jsonb(f) into result from forma.files f where id=p_id;
 if not found then raise sqlstate 'P0002'; end if;
 return result;
end $$;

create function public.forma_work_action(p_studio uuid,p_kind text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=forma.actor_id(); actor_role text; fingerprint text; prior forma.work_requests;
 target uuid; parent uuid; area uuid; person uuid; item_id uuid; item text; task_row forma.tasks; doc forma.documents;
 chat forma.conversations; file_row forma.files; result jsonb; expected integer;
begin
 if actor is null then raise sqlstate '28000'; end if;
 if p_request is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>150000 then raise invalid_parameter_value; end if;
 select role into actor_role from forma.memberships where studio_id=p_studio and account_id=actor and status='active' for share;
 if not found then raise insufficient_privilege; end if;
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

revoke all on function public.forma_work_snapshot(uuid),public.forma_project_content(uuid,uuid),public.forma_conversation_messages(uuid,uuid),public.forma_document_read(uuid,integer),public.forma_file_read(uuid),public.forma_work_action(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.forma_work_snapshot(uuid),public.forma_project_content(uuid,uuid),public.forma_conversation_messages(uuid,uuid),public.forma_document_read(uuid,integer),public.forma_file_read(uuid),public.forma_work_action(uuid,text,jsonb,uuid) to authenticated;

-- Uploads são imutáveis no Storage: sem UPDATE/upsert. Para excluir primeiro
-- retirar o arquivo no domínio; depois a chave nunca aceita uma nova inserção.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('forma-private','forma-private',false,15728640,array['image/png','image/jpeg','image/gif','image/webp','audio/wav','audio/ogg','audio/mpeg','audio/webm','video/webm','video/mp4','text/plain']);

create function forma.upload_proof_valid(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.files f join forma.upload_verifiers k on k.id='primary'
 join storage.objects o on o.bucket_id='forma-private' and o.name=f.object_key
 where f.id=target and f.uploader_id=forma.actor_id() and f.expires_at>now()
 and forma.can_file_scope(f.project_id,f.conversation_id,true)
 and o.owner_id=f.uploader_id::text
 and case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint=f.size else false end
 and split_part(o.metadata->>'mimetype',';',1)=split_part(f.mime,';',1)
 and encode(extensions.hmac(f.id::text||'|'||f.uploader_id::text||'|'||f.sha256||'|'||f.size::text||'|'||f.mime,k.secret,'sha256'),'hex')=current_setting('forma.upload_proof',true))
$$;
create function forma.storage_allowed(object_name text,operation text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.files f where f.object_key=object_name and forma.actor_id() is not null
 and case operation
 when 'insert' then f.status='pending' and f.expires_at>now() and f.uploader_id=forma.actor_id() and forma.can_file_scope(f.project_id,f.conversation_id,true)
 when 'read' then forma.file_readable(f.id) or f.status='deleted' and (f.uploader_id=forma.actor_id() or case when f.project_id is not null then forma.can_project(f.project_id,true) else forma.manage_conversation(f.conversation_id) end)
 when 'delete' then f.status='deleted' and (f.uploader_id=forma.actor_id() or case when f.project_id is not null then forma.can_project(f.project_id,true) else forma.manage_conversation(f.conversation_id) end)
 else false end)
$$;
revoke all on function forma.upload_proof_valid(uuid),forma.storage_allowed(text,text) from public,anon;
grant execute on function forma.upload_proof_valid(uuid),forma.storage_allowed(text,text) to authenticated;
alter policy files_update on forma.files with check(
 (uploader_id=forma.actor_id() or case when project_id is not null then forma.can_project(project_id,true) else forma.manage_conversation(conversation_id) end)
 and (status='deleted' or status='ready' and forma.upload_proof_valid(id)));
create policy forma_objects_insert on storage.objects for insert to authenticated
 with check(bucket_id='forma-private' and forma.storage_allowed(name,'insert'));
create policy forma_objects_select on storage.objects for select to authenticated
 using(bucket_id='forma-private' and forma.storage_allowed(name,'read'));
create policy forma_objects_delete on storage.objects for delete to authenticated
 using(bucket_id='forma-private' and forma.storage_allowed(name,'delete'));
