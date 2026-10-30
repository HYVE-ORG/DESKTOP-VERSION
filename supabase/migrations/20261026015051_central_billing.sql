-- Billing privado: nenhuma cobrança ou concessão de Studio nesta migração.
create schema forma_billing;
revoke all on schema forma_billing from public;
grant usage on schema forma_billing to anon,authenticated;
alter default privileges in schema forma_billing revoke execute on functions from public;
create table forma_billing.server_keys(id text primary key check(id='primary'),secret text not null check(secret ~ '^[a-f0-9]{64}$'));
create table forma_billing.settings(id boolean primary key default true check(id),sales_enabled boolean not null default false,max_studios integer not null default 3 check(max_studios between 1 and 3),max_storage_bytes bigint not null default 750000000 check(max_storage_bytes between 1 and 750000000),max_minutes integer not null default 3000 check(max_minutes between 1 and 3000));
insert into forma_billing.settings(id) values(true);
create table forma_billing.operators(account_id uuid primary key references auth.users(id),enabled boolean not null default true);
create table forma_billing.plan_versions(plan_id text not null check(plan_id in ('essential','pro')),version integer not null check(version>0),name text not null,quote jsonb not null,active boolean not null default true,primary key(plan_id,version));
create unique index billing_one_active_version on forma_billing.plan_versions(plan_id) where active;
insert into forma_billing.plan_versions values
 ('essential',1,'Forma Essencial','{"planId":"essential","version":1,"priceCents":7900,"currency":"BRL","intervalMonths":1,"limits":{"members":10,"workspaces":3,"projects":10,"storageBytes":100000000,"participantMinutes":300,"roomParticipants":8}}',true),
 ('pro',1,'Forma Pro','{"planId":"pro","version":1,"priceCents":14900,"currency":"BRL","intervalMonths":1,"limits":{"members":30,"workspaces":10,"projects":50,"storageBytes":250000000,"participantMinutes":1000,"roomParticipants":8}}',true);
create table forma_billing.offers(id uuid primary key default gen_random_uuid(),recipient_id uuid not null references auth.users(id),name text not null check(char_length(name) between 2 and 100),quote jsonb not null,notes text not null default '' check(char_length(notes)<=4000),expires_at timestamptz not null,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),supersedes uuid references forma_billing.offers(id),revoked_at timestamptz);
create table forma_billing.checkouts(id uuid primary key,owner_id uuid not null references auth.users(id),offer_id uuid references forma_billing.offers(id),company text not null check(char_length(company) between 2 and 80),payer_email text not null,quote jsonb not null,terms_version text not null check(char_length(terms_version) between 1 and 80),status text not null default 'prepared' check(status in ('prepared','creating','ambiguous','pending','active','cancelled','rejected')),provider_id text unique,checkout_url text,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',studio_id uuid unique references forma.studios(id),coverage_end timestamptz,cancelled boolean not null default false,updated_at timestamptz not null default now());
create unique index billing_unfinished_owner on forma_billing.checkouts(owner_id) where status in ('prepared','creating','ambiguous','pending');
create table forma_billing.payments(provider_id text primary key,checkout_id uuid not null references forma_billing.checkouts(id),invoice_id text not null unique,status text not null,amount_cents integer not null check(amount_cents>=0),currency text not null check(currency='BRL'),period_start timestamptz not null,period_end timestamptz not null check(period_end>period_start),provider_updated_at timestamptz not null,updated_at timestamptz not null default now());
create table forma_billing.webhook_inbox(id uuid primary key default gen_random_uuid(),dedup text not null unique,topic text not null check(topic in ('payment','subscription_preapproval','subscription_authorized_payment','topic_chargebacks_wh')),resource_id text not null,received_at timestamptz not null default now(),processed_at timestamptz,attempts integer not null default 0,lease_until timestamptz,last_error text);
create table forma_billing.audit(id uuid primary key default gen_random_uuid(),actor_id uuid,operation text not null,resource_id uuid,created_at timestamptz not null default now());
create table forma_billing.nonces(nonce uuid primary key,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['server_keys','settings','operators','plan_versions','offers','checkouts','payments','webhook_inbox','audit','nonces'] loop
 execute format('alter table forma_billing.%I enable row level security',t);execute format('alter table forma_billing.%I force row level security',t);
 execute format('revoke all on forma_billing.%I from public,anon,authenticated',t);
end loop;end $$;

create function forma_billing.plans() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',plan_id,'name',name)||quote order by case when plan_id='essential' then 0 else 1 end),'[]') from forma_billing.plan_versions where active
$$;
create function public.forma_billing_plans() returns jsonb language sql stable security invoker set search_path='' as $$ select forma_billing.plans() $$;
revoke all on function forma_billing.plans(),public.forma_billing_plans() from public;
grant execute on function forma_billing.plans(),public.forma_billing_plans() to anon,authenticated;

create function forma_billing.account() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=forma.actor_id();op boolean;result jsonb;begin
 op:=exists(select 1 from forma_billing.operators where account_id=actor and enabled);
 select jsonb_build_object('operator',op,'salesEnabled',(select sales_enabled from forma_billing.settings where id),
 'checkouts',coalesce((select jsonb_agg(to_jsonb(c)-'payer_email' order by created_at desc) from forma_billing.checkouts c where owner_id=actor),'[]'),
 'offers',coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from forma_billing.offers o where op or recipient_id=actor),'[]')) into result;
 return result;
end $$;
create function public.forma_billing_account() returns jsonb language sql stable security invoker set search_path='' as $$ select forma_billing.account() $$;
revoke all on function forma_billing.account(),public.forma_billing_account() from public,anon;
grant execute on function forma_billing.account(),public.forma_billing_account() to authenticated;

-- Atestação estreita do backend. Envelope UTF-8 exato assinado; nunca service_role.
create function forma_billing.server(p_payload text,p_proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb;d jsonb;secret text;nonce uuid;op text;actor uuid;result jsonb;cached forma_billing.nonces;cfg forma_billing.settings;c forma_billing.checkouts;offer forma_billing.offers;quote jsonb;req uuid;used_count integer;used_bytes bigint;used_minutes bigint;is_operator boolean;
begin
 if octet_length(p_payload)>65536 or p_proof !~ '^[a-f0-9]{64}$' then raise insufficient_privilege;end if;
 select k.secret into secret from forma_billing.server_keys k where id='primary';
 if secret is null or encode(extensions.hmac(convert_to(p_payload,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex') is distinct from p_proof then raise insufficient_privilege;end if;
 e:=p_payload::jsonb;nonce:=(e->>'nonce')::uuid;op:=e->>'operation';d:=e->'data';
 if abs(extract(epoch from clock_timestamp())-(e->>'timestamp')::bigint)>60 or nonce is null or jsonb_typeof(d)<>'object' then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('forma-billing:'||nonce::text,0));
 select * into cached from forma_billing.nonces n where n.nonce=nonce;
 if found then if cached.payload_hash<>encode(extensions.digest(p_payload,'sha256'),'hex') then raise insufficient_privilege;end if;return cached.result;end if;
 if op in ('prepare','claim','offer.create','offer.revoke') then actor:=forma.actor_id();end if;
 is_operator:=actor is not null and exists(select 1 from forma_billing.operators where account_id=actor and enabled);
 case op
 when 'prepare' then
  select * into cfg from forma_billing.settings where id for update;
  if not cfg.sales_enabled then raise exception using errcode='42501',message='Vendas ainda não liberadas';end if;
  req:=(d->>'requestId')::uuid;
  select * into c from forma_billing.checkouts where id=req or owner_id=actor and status in ('prepared','creating','ambiguous','pending') order by created_at limit 1 for update;
  if found then
   if c.owner_id<>actor or c.company<>d->>'company' or coalesce(c.offer_id::text,c.quote->>'planId')<>coalesce(d->>'offerId',d->>'planId') then raise exception using errcode='23505',message='Contratação já iniciada';end if;
   result:=to_jsonb(c);
  else
   if d->>'offerId' is not null then
    select * into offer from forma_billing.offers where id=(d->>'offerId')::uuid and recipient_id=actor and revoked_at is null and expires_at>now() for share;
    if not found then raise insufficient_privilege;end if;quote:=offer.quote;
   else select v.quote into quote from forma_billing.plan_versions v where plan_id=d->>'planId' and active;end if;
   if quote is null then raise insufficient_privilege;end if;
   select count(*),coalesce(sum((x.quote->'limits'->>'storageBytes')::bigint),0),coalesce(sum((x.quote->'limits'->>'participantMinutes')::bigint),0) into used_count,used_bytes,used_minutes from forma_billing.checkouts x where x.status not in ('cancelled','rejected');
   if used_count>=cfg.max_studios or used_bytes+(quote->'limits'->>'storageBytes')::bigint>cfg.max_storage_bytes or used_minutes+(quote->'limits'->>'participantMinutes')::bigint>cfg.max_minutes then raise exception using errcode='23514',message='Sem capacidade para nova contratação';end if;
   insert into forma_billing.checkouts(id,owner_id,offer_id,company,payer_email,quote,terms_version) values(req,actor,offer.id,d->>'company',forma.actor_email(),quote,d->>'termsVersion') returning * into c;
   result:=to_jsonb(c);
  end if;
 when 'claim' then
  select * into c from forma_billing.checkouts where id=(d->>'id')::uuid and owner_id=actor for update;
  if not found then raise insufficient_privilege;end if;
  if c.status='prepared' and c.expires_at>now() then update forma_billing.checkouts set status='creating',updated_at=now() where id=c.id returning * into c;result:=to_jsonb(c)||'{"shouldCreate":true}';
  else result:=to_jsonb(c)||'{"shouldCreate":false}';end if;
 when 'attach' then
  select * into c from forma_billing.checkouts where id=(d->>'id')::uuid for update;
  if not found or c.status not in ('creating','ambiguous','pending') or c.provider_id is not null and c.provider_id<>d->>'providerId' then raise insufficient_privilege;end if;
  if d->>'providerId' !~ '^[a-zA-Z0-9_-]{1,100}$' or d->>'checkoutUrl' !~ '^https://www\.mercadopago\.com\.br/subscriptions/checkout\?' then raise insufficient_privilege;end if;
  update forma_billing.checkouts set provider_id=d->>'providerId',checkout_url=d->>'checkoutUrl',status='pending',updated_at=now() where id=c.id returning * into c;result:=to_jsonb(c);
 when 'ambiguous' then
  update forma_billing.checkouts set status='ambiguous',updated_at=now() where id=(d->>'id')::uuid and status='creating';result:='{"ok":true}';
 when 'webhook' then
  insert into forma_billing.webhook_inbox(dedup,topic,resource_id) values(d->>'dedup',d->>'topic',d->>'resourceId') on conflict(dedup) do nothing;result:='{"ok":true}';
 when 'offer.create' then
  if not is_operator then raise insufficient_privilege;end if;
  quote:=d->'quote';
  if quote->>'planId'<>'enterprise' or quote->>'currency'<>'BRL' or (quote->>'priceCents')::numeric<1 or (quote->>'priceCents')::numeric<>trunc((quote->>'priceCents')::numeric) or (quote->>'intervalMonths')::int<>1 then raise insufficient_privilege;end if;
  if exists(select 1 from jsonb_each_text(quote->'limits') as lim where lim.value::numeric<1 or lim.value::numeric<>trunc(lim.value::numeric)) then raise insufficient_privilege;end if;
  if (quote->'limits'->>'roomParticipants')::int>8 or (d->>'expiresAt')::timestamptz<=now() then raise insufficient_privilege;end if;
  if d->>'supersedes' is not null then select * into offer from forma_billing.offers where id=(d->>'supersedes')::uuid for update;if not found or offer.recipient_id<>(d->>'recipientId')::uuid then raise insufficient_privilege;end if;update forma_billing.offers set revoked_at=now() where id=offer.id;end if;
  quote:=jsonb_set(quote,'{version}',to_jsonb(coalesce((offer.quote->>'version')::int,0)+1));
  insert into forma_billing.offers(recipient_id,name,quote,notes,expires_at,created_by,supersedes) values((d->>'recipientId')::uuid,d->>'name',quote,coalesce(d->>'notes',''),(d->>'expiresAt')::timestamptz,actor,offer.id) returning * into offer;result:=to_jsonb(offer);
 when 'offer.revoke' then
  if not is_operator then raise insufficient_privilege;end if;
  update forma_billing.offers set revoked_at=coalesce(revoked_at,now()) where id=(d->>'id')::uuid;result:='{"ok":true}';
 else raise insufficient_privilege;
 end case;
 if result is null then raise insufficient_privilege;end if;
 insert into forma_billing.nonces(nonce,payload_hash,result) values(nonce,encode(extensions.digest(p_payload,'sha256'),'hex'),result);
 insert into forma_billing.audit(actor_id,operation) values(actor,op);
 return result;
end $$;
create function public.forma_billing_server(p_payload text,p_proof text) returns jsonb language sql security invoker set search_path='' as $$ select forma_billing.server(p_payload,p_proof) $$;
revoke all on function forma_billing.server(text,text),public.forma_billing_server(text,text) from public;
grant execute on function forma_billing.server(text,text),public.forma_billing_server(text,text) to anon,authenticated;
