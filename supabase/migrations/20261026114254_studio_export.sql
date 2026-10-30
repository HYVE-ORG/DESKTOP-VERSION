-- Leitura administrativa estreita; não exporta Auth, billing, apagados ou objetos Storage.
create function forma.studio_export_page(p_studio uuid,p_section text,p_after text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source text; rows jsonb; page_size integer; last_key text;
begin
 if forma.actor_id() is null then raise invalid_authorization_specification; end if;
 if forma.studio_role(p_studio) is distinct from 'admin' then raise insufficient_privilege; end if;
 if p_after is not null and (char_length(p_after)>100 or p_after !~ '^[0-9a-f/-]+$') then raise invalid_parameter_value; end if;
 case p_section
 when 'studio' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.name,t.created_at) r) as record from forma.studios t where t.id=$1';
 when 'members' then source:='select t.account_id::text as export_key, (select to_jsonb(r) from (select t.account_id,t.role,t.status,p.name,p.handle) r) as record from forma.memberships t left join forma.profiles p on p.account_id=t.account_id where t.studio_id=$1';
 when 'workspaces' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.studio_id,t.name,t.color,t.version,t.archived) r) as record from forma.workspaces t where t.studio_id=$1';
 when 'workspace_access' then source:='select t.workspace_id::text||''/''||t.account_id::text as export_key, (select to_jsonb(r) from (select t.workspace_id,t.account_id,t.enabled) r) as record from forma.workspace_access t where t.studio_id=$1';
 when 'projects' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.studio_id,t.workspace_id,t.name,t.description,t.color,t.version,t.archived,t.created_by,t.created_at) r) as record from forma.projects t where t.studio_id=$1';
 when 'project_access' then source:='select t.project_id::text||''/''||t.account_id::text as export_key, (select to_jsonb(r) from (select t.project_id,t.account_id,t.enabled) r) as record from forma.project_access t where t.studio_id=$1';
 when 'tasks' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.project_id,t.title,t.description,t.status,t.priority,t.due_date,t.version,t.created_by,t.created_at,t.updated_at) r) as record from forma.tasks t where t.studio_id=$1';
 when 'task_assignees' then source:='select t.task_id::text||''/''||t.account_id::text as export_key, (select to_jsonb(r) from (select t.task_id,t.project_id,t.account_id) r) as record from forma.task_assignees t where t.studio_id=$1';
 when 'conversations' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.workspace_id,t.project_id,t.name,t.archived) r) as record from forma.conversations t where t.studio_id=$1';
 when 'messages' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.conversation_id,t.author_id,t.body,t.version,t.created_at,t.edited_at) r) as record from forma.messages t where t.studio_id=$1 and t.deleted_at is null';
 when 'documents' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.project_id,t.title,t.body,t.version,t.updated_at,t.updated_by) r) as record from forma.documents t where t.studio_id=$1';
 when 'document_revisions' then source:='select t.document_id::text||''/''||lpad(t.version::text,10,''0'') as export_key, (select to_jsonb(r) from (select t.document_id,t.project_id,t.version,t.title,t.body,t.saved_by,t.saved_at) r) as record from forma.document_revisions t where t.studio_id=$1';
 when 'files' then source:='select t.id::text as export_key, (select to_jsonb(r) from (select t.id,t.project_id,t.conversation_id,t.uploader_id,t.name,t.mime,t.size,t.sha256,t.created_at) r) as record from forma.files t where t.studio_id=$1 and t.status=''ready''';
 when 'message_attachments' then source:='select t.message_id::text||''/''||t.file_id::text as export_key, (select to_jsonb(r) from (select t.message_id,t.conversation_id,t.file_id) r) as record from forma.message_attachments t join forma.messages m on m.id=t.message_id join forma.files f on f.id=t.file_id where t.studio_id=$1 and m.deleted_at is null and f.status=''ready''';
 else raise invalid_parameter_value;
 end case;
 page_size:=case when p_section in ('documents','document_revisions') then 1 when p_section in ('messages','tasks') then 5 else 25 end;
 execute 'select coalesce(jsonb_agg(jsonb_build_object(''key'',export_key,''record'',record) order by export_key),''[]''::jsonb) from (select * from ('||source||') s where ($2 is null or export_key>$2) order by export_key limit $3) page'
 into rows using p_studio,p_after,page_size;
 if jsonb_array_length(rows)=page_size then last_key:=rows->(page_size-1)->>'key'; end if;
 return jsonb_build_object('rows',rows,'nextCursor',last_key);
end $$;
revoke all on function forma.studio_export_page(uuid,text,text) from public,anon;
grant execute on function forma.studio_export_page(uuid,text,text) to authenticated;
create function public.forma_studio_export_page(p_studio uuid,p_section text,p_after text default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select forma.studio_export_page(p_studio,p_section,p_after) $$;
revoke all on function public.forma_studio_export_page(uuid,text,text) from public,anon;
grant execute on function public.forma_studio_export_page(uuid,text,text) to authenticated;
