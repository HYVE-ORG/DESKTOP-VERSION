alter table forma.files add column purged_at timestamptz;
create function forma_billing.can_write(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from forma_billing.checkouts where studio_id=sid) or exists(select 1 from forma_billing.checkouts where studio_id=sid and (coverage_end>now() or not cancelled and coverage_end+interval '7 days'>now()))
$$;
revoke all on function forma_billing.can_write(uuid) from public,anon;
grant execute on function forma_billing.can_write(uuid) to authenticated;

create function forma_billing.guard_work() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;c forma_billing.checkouts;lim jsonb;n bigint;email text;begin
 sid:=case when tg_op='DELETE' then old.studio_id else new.studio_id end;
 select * into c from forma_billing.checkouts where studio_id=sid for update;
 if not found then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_table_name='files' and tg_op='UPDATE' then if new.status='deleted' then return new;end if;end if;
 if not forma_billing.can_write(sid) then raise insufficient_privilege using message='Studio em somente leitura: confira a assinatura';end if;
 lim:=c.quote->'limits';
 if tg_table_name='projects' and tg_op<>'DELETE' then
  if not new.archived then select count(*) into n from forma.projects where studio_id=sid and not archived and id<>new.id;if n>=(lim->>'projects')::int then raise check_violation using message='Limite de projetos ativos atingido';end if;end if;
 elsif tg_table_name='workspaces' and tg_op<>'DELETE' then
  if not new.archived then select count(*) into n from forma.workspaces where studio_id=sid and not archived and id<>new.id;if n>=(lim->>'workspaces')::int then raise check_violation using message='Limite de áreas ativas atingido';end if;end if;
 elsif tg_table_name='files' and tg_op='INSERT' then
  select coalesce(sum(size),0) into n from forma.files where studio_id=sid and purged_at is null;
  if n+new.size>(lim->>'storageBytes')::bigint then raise check_violation using message='Limite de arquivos atingido';end if;
 elsif tg_table_name in ('memberships','invitations') and tg_op<>'DELETE' then
  if tg_table_name='memberships' then
   if new.status<>'active' then return new;end if;select lower(u.email) into email from auth.users u where u.id=new.account_id;
  else if new.status<>'pending' or new.expires_at<=now() then return new;end if;email:=new.recipient_email;end if;
  select count(*) into n from (select lower(u.email) as address from forma.memberships m join auth.users u on u.id=m.account_id where m.studio_id=sid and m.status='active' union select recipient_email from forma.invitations where studio_id=sid and status='pending' and expires_at>now()) seats where address<>email;
  if n>=(lim->>'members')::int then raise check_violation using message='Limite de membros atingido';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function forma_billing.guard_work() from public,anon,authenticated;
do $$ declare t text;begin foreach t in array array['workspaces','projects','tasks','task_assignees','conversations','messages','documents','document_revisions','files','message_attachments','memberships','invitations','workspace_access','project_access'] loop
 execute format('create trigger billing_entitlement_guard before insert or update or delete on forma.%I for each row execute function forma_billing.guard_work()',t);
end loop;end $$;

create policy forma_billing_storage_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'forma-private' or forma_billing.can_write(split_part(name,'/',1)::uuid));

create function forma_billing.confirm_file_purge(fid uuid) returns void language plpgsql security definer set search_path='' as $$
declare f forma.files;actor uuid:=forma.actor_id();begin
 select * into f from forma.files where id=fid for update;
 if not found or f.status<>'deleted' or not forma.can_file_scope(f.project_id,f.conversation_id) or not(f.uploader_id=actor or case when f.project_id is not null then forma.can_project(f.project_id,true) else forma.manage_conversation(f.conversation_id) end) then raise insufficient_privilege;end if;
 if exists(select 1 from storage.objects where bucket_id='forma-private' and name=f.object_key) then raise check_violation using message='Limpeza de bytes ainda pendente';end if;
 update forma.files set purged_at=coalesce(purged_at,now()) where id=f.id;
end $$;
create function public.forma_file_purge_confirm(p_id uuid) returns void language sql security invoker set search_path='' as $$ select forma_billing.confirm_file_purge(p_id) $$;
revoke all on function forma_billing.confirm_file_purge(uuid),public.forma_file_purge_confirm(uuid) from public,anon;
grant execute on function forma_billing.confirm_file_purge(uuid),public.forma_file_purge_confirm(uuid) to authenticated;
