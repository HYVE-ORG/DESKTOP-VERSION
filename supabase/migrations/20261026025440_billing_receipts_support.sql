create table forma_billing.requests(id uuid primary key default gen_random_uuid(),request_id uuid not null,actor_id uuid not null references auth.users(id),checkout_id uuid references forma_billing.checkouts(id),kind text not null check(kind in ('enterprise','refund','plan_change','help')),message text not null check(char_length(btrim(message)) between 2 and 4000),created_at timestamptz not null default now(),status text not null default 'open' check(status in ('open','answered')),response text check(char_length(response)<=4000),responded_by uuid references auth.users(id),responded_at timestamptz,unique(actor_id,request_id));
alter table forma_billing.requests enable row level security;
alter table forma_billing.requests force row level security;
revoke all on forma_billing.requests from public,anon,authenticated;

create function forma_billing.receipts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=forma.actor_id();begin
 return jsonb_build_object('exportedAt',now(),'notice','Registro de contratação e pagamentos; não é nota fiscal.',
 'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'company',c.company,'quote',c.quote,'acceptedTerms',c.terms_version,'createdAt',c.created_at,'cancelled',c.cancelled,'coverageEnd',c.coverage_end)) from forma_billing.checkouts c where c.owner_id=actor),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.period_start desc) from forma_billing.payments p join forma_billing.checkouts c on c.id=p.checkout_id where c.owner_id=actor),'[]'));
end $$;
create function forma_billing.requests_read() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=forma.actor_id();op boolean;begin
 op:=exists(select 1 from forma_billing.operators where account_id=actor and enabled);
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from forma_billing.requests r where r.actor_id=actor or op),'[]');
end $$;
create function forma_billing.request_create(p_request uuid,p_kind text,p_checkout uuid,p_message text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=forma.actor_id();r forma_billing.requests;begin
 perform pg_advisory_xact_lock(hashtextextended('billing-support:'||actor::text,0));
 if p_kind not in ('enterprise','refund','plan_change','help') or char_length(btrim(p_message)) not between 2 and 4000 then raise check_violation;end if;
 if p_checkout is not null and not exists(select 1 from forma_billing.checkouts where id=p_checkout and owner_id=actor) or p_checkout is null and p_kind in ('refund','plan_change') then raise insufficient_privilege;end if;
 select * into r from forma_billing.requests where actor_id=actor and request_id=p_request;
 if found then if r.kind<>p_kind or r.checkout_id is distinct from p_checkout or r.message<>p_message then raise serialization_failure;end if;return to_jsonb(r);end if;
 if (select count(*) from forma_billing.requests where actor_id=actor and created_at>now()-interval '1 hour')>=20 then raise check_violation using message='Limite de solicitações por hora atingido';end if;
 insert into forma_billing.requests(request_id,actor_id,checkout_id,kind,message) values(p_request,actor,p_checkout,p_kind,p_message) returning * into r;return to_jsonb(r);
end $$;
create function forma_billing.request_respond(p_id uuid,p_response text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=forma.actor_id();r forma_billing.requests;begin
 if not exists(select 1 from forma_billing.operators where account_id=actor and enabled) then raise insufficient_privilege;end if;
 if char_length(btrim(p_response)) not between 2 and 4000 then raise check_violation;end if;
 update forma_billing.requests set response=p_response,status='answered',responded_by=actor,responded_at=now() where id=p_id returning * into r;
 if not found then raise no_data_found;end if;
 insert into forma_billing.audit(actor_id,operation,resource_id) values(actor,'support.respond',p_id);return to_jsonb(r);
end $$;
create function public.forma_billing_receipts() returns jsonb language sql stable security invoker set search_path='' as $$ select forma_billing.receipts() $$;
create function public.forma_billing_requests() returns jsonb language sql stable security invoker set search_path='' as $$ select forma_billing.requests_read() $$;
create function public.forma_billing_request_create(p_request uuid,p_kind text,p_checkout uuid,p_message text) returns jsonb language sql security invoker set search_path='' as $$ select forma_billing.request_create(p_request,p_kind,p_checkout,p_message) $$;
create function public.forma_billing_request_respond(p_id uuid,p_response text) returns jsonb language sql security invoker set search_path='' as $$ select forma_billing.request_respond(p_id,p_response) $$;
revoke all on function forma_billing.receipts(),forma_billing.requests_read(),forma_billing.request_create(uuid,text,uuid,text),forma_billing.request_respond(uuid,text),public.forma_billing_receipts(),public.forma_billing_requests(),public.forma_billing_request_create(uuid,text,uuid,text),public.forma_billing_request_respond(uuid,text) from public,anon;
grant execute on function forma_billing.receipts(),forma_billing.requests_read(),forma_billing.request_create(uuid,text,uuid,text),forma_billing.request_respond(uuid,text),public.forma_billing_receipts(),public.forma_billing_requests(),public.forma_billing_request_create(uuid,text,uuid,text),public.forma_billing_request_respond(uuid,text) to authenticated;
