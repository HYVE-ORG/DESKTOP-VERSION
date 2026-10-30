alter table forma_billing.webhook_inbox add column lease_id uuid;
create function forma_billing.payment_sync(d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c forma_billing.checkouts;p forma_billing.payments;sid uuid;wid uuid;pid uuid;amount integer;stamp timestamptz;begin
 select * into c from forma_billing.checkouts where id=(d->>'checkoutId')::uuid for update;
 if not found or c.provider_id is distinct from d->>'subscriptionId' or c.status in ('prepared','rejected') then raise insufficient_privilege;end if;
 amount:=(d->>'amountCents')::integer;stamp:=(d->>'providerUpdatedAt')::timestamptz;
 if amount<>(c.quote->>'priceCents')::int or d->>'currency'<>'BRL' or d->>'status' not in ('approved','pending','rejected','cancelled','refunded','charged_back') or (d->>'periodEnd')::timestamptz<=(d->>'periodStart')::timestamptz or stamp>now()+interval '5 minutes' then raise insufficient_privilege;end if;
 select * into p from forma_billing.payments where provider_id=d->>'paymentId' or invoice_id=d->>'invoiceId' for update;
 if found then
  if p.checkout_id<>c.id or p.invoice_id<>d->>'invoiceId' or p.provider_id<>d->>'paymentId' or p.period_start<>(d->>'periodStart')::timestamptz or p.period_end<>(d->>'periodEnd')::timestamptz then raise insufficient_privilege;end if;
  if stamp>=p.provider_updated_at and not(p.status in ('refunded','charged_back') and d->>'status'='approved') then update forma_billing.payments set status=d->>'status',provider_updated_at=stamp,updated_at=now() where provider_id=p.provider_id;end if;
 else
  insert into forma_billing.payments(provider_id,checkout_id,invoice_id,status,amount_cents,currency,period_start,period_end,provider_updated_at) values(d->>'paymentId',c.id,d->>'invoiceId',d->>'status',amount,'BRL',(d->>'periodStart')::timestamptz,(d->>'periodEnd')::timestamptz,stamp);
 end if;
 update forma_billing.checkouts set coverage_end=(select max(period_end) from forma_billing.payments where checkout_id=c.id and status='approved' and period_start<=now()),updated_at=now() where id=c.id returning * into c;
 if c.studio_id is null and c.coverage_end>now() then
  if not exists(select 1 from auth.users where id=c.owner_id and email_confirmed_at is not null and deleted_at is null and coalesce(banned_until,'-infinity')<now()) then raise insufficient_privilege;end if;
  insert into forma.studios(name) values(c.company) returning id into sid;
  insert into forma.memberships(studio_id,account_id,role) values(sid,c.owner_id,'admin');
  insert into forma.workspaces(studio_id,created_by,name) values(sid,c.owner_id,'Equipe') returning id into wid;
  insert into forma.projects(studio_id,workspace_id,name,created_by) values(sid,wid,'Primeiro projeto',c.owner_id) returning id into pid;
  insert into forma.workspace_access(studio_id,workspace_id,account_id) values(sid,wid,c.owner_id);
  insert into forma.project_access(studio_id,project_id,account_id) values(sid,pid,c.owner_id);
  insert into forma.conversations(studio_id,workspace_id,project_id,name) values(sid,wid,null,'Geral da equipe'),(sid,wid,pid,'Geral do projeto');
  update forma_billing.checkouts set studio_id=sid,status='active',updated_at=now() where id=c.id returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'studioId',c.studio_id,'coverageEnd',c.coverage_end);
end $$;
revoke all on function forma_billing.payment_sync(jsonb) from public,anon,authenticated;

create or replace function forma_billing.server(p_payload text,p_proof text) returns jsonb language plpgsql security definer set search_path='' as $$
<<billing_rpc>>
declare e jsonb;d jsonb;secret text;nonce uuid;op text;actor uuid;result jsonb;cached forma_billing.nonces;cfg forma_billing.settings;c forma_billing.checkouts;offer forma_billing.offers;quote jsonb;req uuid;used_count integer;used_bytes bigint;used_minutes bigint;is_operator boolean;
begin
 if octet_length(p_payload)>65536 or p_proof !~ '^[a-f0-9]{64}$' then raise insufficient_privilege;end if;
 select k.secret into secret from forma_billing.server_keys k where id='primary';
 if secret is null or encode(extensions.hmac(convert_to(p_payload,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex') is distinct from p_proof then raise insufficient_privilege;end if;
 e:=p_payload::jsonb;nonce:=(e->>'nonce')::uuid;op:=e->>'operation';d:=e->'data';
 if abs(extract(epoch from clock_timestamp())-(e->>'timestamp')::bigint)>60 or nonce is null or jsonb_typeof(d)<>'object' then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('forma-billing:'||nonce::text,0));
 select * into cached from forma_billing.nonces n where n.nonce=billing_rpc.nonce;
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
 when 'payment.sync' then result:=forma_billing.payment_sync(d);
 when 'lookup' then
  select * into c from forma_billing.checkouts where id=(d->>'id')::uuid;
  if not found then raise no_data_found;end if;result:=to_jsonb(c);
 when 'reconcile.list' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select id,status,provider_id from forma_billing.checkouts where status in ('creating','ambiguous','pending','active') order by updated_at limit 25) x;
 when 'subscription.sync' then
  select * into c from forma_billing.checkouts where id=(d->>'id')::uuid for update;
  if not found or c.provider_id is distinct from d->>'providerId' or d->>'status' not in ('pending','authorized','paused','cancelled') then raise insufficient_privilege;end if;
  if d->>'status'='cancelled' then update forma_billing.checkouts set cancelled=true,status=case when studio_id is null then 'cancelled' else status end,updated_at=now() where id=c.id;end if;
  result:='{"ok":true}';
 when 'jobs.claim' then
  with picked as (select id from forma_billing.webhook_inbox where processed_at is null and coalesce(lease_until,'-infinity')<now() order by received_at limit 10 for update skip locked),
  leased as (update forma_billing.webhook_inbox set lease_until=now()+interval '3 minutes',lease_id=gen_random_uuid(),attempts=attempts+1 where id in(select id from picked) returning *)
  select coalesce(jsonb_agg(to_jsonb(leased)),'[]') into result from leased;
 when 'jobs.finish' then
  update forma_billing.webhook_inbox set processed_at=case when (d->>'success')::boolean then now() else null end,lease_until=now()+interval '5 minutes',last_error=case when (d->>'success')::boolean then null else 'Conciliação pendente; conferir no provedor' end where id=(d->>'id')::uuid and lease_id=(d->>'leaseId')::uuid;result:='{"ok":true}';
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
 insert into forma_billing.nonces(nonce,payload_hash,result) values(billing_rpc.nonce,encode(extensions.digest(p_payload,'sha256'),'hex'),result);
 insert into forma_billing.audit(actor_id,operation) values(actor,op);
 return result;
end $$;
