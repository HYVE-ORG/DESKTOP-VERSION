-- Metadados e bytes de uma retirada lógica também exigem escopo atual.
alter policy files_read on forma.files using(
 forma.file_readable(id) or uploader_id=forma.actor_id() and status in ('pending','deleted') and forma.can_file_scope(project_id,conversation_id));
create or replace function forma.storage_allowed(object_name text,operation text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from forma.files f where f.object_key=object_name and forma.actor_id() is not null
 and case operation
 when 'insert' then f.status='pending' and f.expires_at>now() and f.uploader_id=forma.actor_id() and forma.can_file_scope(f.project_id,f.conversation_id,true)
 when 'read' then forma.file_readable(f.id) or f.status='deleted' and forma.can_file_scope(f.project_id,f.conversation_id) and (f.uploader_id=forma.actor_id() or case when f.project_id is not null then forma.can_project(f.project_id,true) else forma.manage_conversation(f.conversation_id) end)
 when 'delete' then f.status='deleted' and forma.can_file_scope(f.project_id,f.conversation_id) and (f.uploader_id=forma.actor_id() or case when f.project_id is not null then forma.can_project(f.project_id,true) else forma.manage_conversation(f.conversation_id) end)
 else false end)
$$;
revoke all on function forma.storage_allowed(text,text) from public,anon;
grant execute on function forma.storage_allowed(text,text) to authenticated;
