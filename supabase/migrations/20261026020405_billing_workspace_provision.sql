create or replace function forma_billing.payment_sync(d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  insert into forma.workspaces(studio_id,name) values(sid,'Equipe') returning id into wid;
  insert into forma.projects(studio_id,workspace_id,name,created_by) values(sid,wid,'Primeiro projeto',c.owner_id) returning id into pid;
  insert into forma.workspace_access(studio_id,workspace_id,account_id) values(sid,wid,c.owner_id);
  insert into forma.project_access(studio_id,project_id,account_id) values(sid,pid,c.owner_id);
  insert into forma.conversations(studio_id,workspace_id,project_id,name) values(sid,wid,null,'Geral da equipe'),(sid,wid,pid,'Geral do projeto');
  update forma_billing.checkouts set studio_id=sid,status='active',updated_at=now() where id=c.id returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'studioId',c.studio_id,'coverageEnd',c.coverage_end);
end $$;
