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
