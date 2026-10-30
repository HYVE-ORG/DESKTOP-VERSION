-- Configuração do projeto permite restaurar, sem liberar escrita de tarefas
-- dentro de espaços arquivados.
create function forma.can_edit_project(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select forma.can_project(target) and exists(select 1 from forma.projects p where p.id=target and forma.studio_role(p.studio_id) in ('admin','coordinator'))
$$;
revoke all on function forma.can_edit_project(uuid) from public,anon;
grant execute on function forma.can_edit_project(uuid) to authenticated;
alter policy projects_update on forma.projects using(forma.can_edit_project(id)) with check(forma.can_edit_project(id));

create or replace function public.forma_project_content(p_project uuid,p_after uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cursor_at timestamptz;
begin
 if forma.actor_id() is null then raise sqlstate '28000'; end if;
 if not forma.can_project(p_project) then raise insufficient_privilege; end if;
 if p_after is not null then select created_at into cursor_at from forma.tasks where id=p_after and project_id=p_project;
  if not found then raise invalid_parameter_value; end if;
 end if;
 return jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('assignee_ids',coalesce((select jsonb_agg(a.account_id order by a.account_id) from forma.task_assignees a where a.task_id=t.id),'[]')) order by t.created_at desc,t.id desc)
 from(select * from forma.tasks where project_id=p_project and (p_after is null or (created_at,id)<(cursor_at,p_after)) order by created_at desc,id desc limit 50)t),'[]'),
 'total_tasks',(select count(*) from forma.tasks where project_id=p_project),
 'documents',coalesce((select jsonb_agg(to_jsonb(d)-'body' order by d.title,d.id) from forma.documents d where d.project_id=p_project),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(f)-'object_key' order by f.created_at desc,f.id) from forma.files f where f.project_id=p_project and f.status='ready'),'[]'));
end $$;

-- A mesma trava da reserva ordena o cancelamento. Cancelar antes da reserva
-- registra uma chave consumida, impedindo uma publicação tardia pelo request.
create function public.forma_upload_cancel(p_studio uuid,p_request uuid,p_cleanup_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=forma.actor_id();prior forma.work_requests;target uuid;result jsonb;
begin
 if actor is null then raise sqlstate '28000'; end if;
 if forma.lock_actor_studio(p_studio) is null then raise insufficient_privilege; end if;
 if p_request is null or p_cleanup_request is null or p_request=p_cleanup_request then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request::text,0));
 select * into prior from forma.work_requests where account_id=actor and request_id=p_request;
 if not found then
  insert into forma.work_requests(account_id,request_id,studio_id,kind,fingerprint,result) values(actor,p_request,p_studio,'file.cancel','',jsonb_build_object('canceled',true));
  return jsonb_build_object('canceled',true);
 end if;
 if prior.studio_id<>p_studio or prior.kind not in ('file.reserve','file.cancel') then raise unique_violation; end if;
 if prior.kind='file.cancel' then return prior.result; end if;
 target:=(prior.result->>'id')::uuid;
 perform public.forma_file_read(target);
 result:=public.forma_work_action(p_studio,'file.delete',jsonb_build_object('id',target),p_cleanup_request);
 return result||jsonb_build_object('canceled',true);
end $$;
revoke all on function public.forma_upload_cancel(uuid,uuid,uuid) from public,anon;
grant execute on function public.forma_upload_cancel(uuid,uuid,uuid) to authenticated;
