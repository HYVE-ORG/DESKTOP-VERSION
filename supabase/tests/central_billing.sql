-- Fixtures de billing: executar com rollback, sem gateway ou usuários reais.
begin;
do $$ begin
 if to_regclass('forma_billing.plan_versions') is null then raise exception 'Billing ainda não implementado';end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('61000000-0000-4000-8000-000000000001','buyer@billing.invalid',now(),'authenticated','authenticated'),
 ('61000000-0000-4000-8000-000000000002','other@billing.invalid',now(),'authenticated','authenticated');
insert into auth.sessions(id,user_id) values
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001'),
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002');
insert into forma_billing.server_keys(id,secret) values('primary',repeat('e',64)) on conflict(id) do update set secret=excluded.secret;
update forma_billing.settings set sales_enabled=true where id=true;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","session_id":"62000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare p text;proof text;r jsonb;begin
 if jsonb_array_length(public.forma_billing_plans())<>2 or public.forma_billing_plans()->0->>'priceCents'<>'7900' then raise exception 'Catálogo incorreto';end if;
 p:=jsonb_build_object('operation','prepare','nonce',gen_random_uuid(),'timestamp',extract(epoch from clock_timestamp())::bigint,'data',jsonb_build_object('requestId','63000000-0000-4000-8000-000000000001','planId','essential','planVersion',1,'company','Empresa QA','termsVersion','beta-1'))::text;
 begin perform public.forma_billing_server(p,repeat('a',64));raise exception 'Atestação forjada aceita';exception when insufficient_privilege then null;end;
 proof:=encode(extensions.hmac(convert_to(p,'UTF8'),convert_to(repeat('e',64),'UTF8'),'sha256'),'hex');
 r:=public.forma_billing_server(p,proof);
 if r->'quote'->>'priceCents'<>'7900' or r->>'status'<>'prepared' then raise exception 'Reserva incorreta';end if;
 if public.forma_billing_server(p,proof)<>r then raise exception 'Replay mudou resultado';end if;
 if jsonb_array_length(public.forma_billing_account()->'checkouts')<>1 then raise exception 'Reserva ausente';end if;
 begin perform public.forma_billing_account()->'server_keys';exception when others then raise;end;
end $$;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","session_id":"62000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if jsonb_array_length(public.forma_billing_account()->'checkouts')<>0 then raise exception 'Billing cruzado';end if;end $$;
reset role;
do $$ begin
 if (select count(*) from forma.studios)<>0 then raise exception 'Reserva criou Studio sem pagamento';end if;
 if has_table_privilege('authenticated','forma_billing.checkouts','INSERT') then raise exception 'Escrita direta liberada';end if;
 if has_table_privilege('anon','forma_billing.server_keys','SELECT') then raise exception 'Chave exposta';end if;
 if has_column_privilege('authenticated','forma.files','purged_at','INSERT') then raise exception 'Purga forjada permitida';end if;
end $$;
update forma_billing.checkouts set provider_id='subscription-qa',status='pending' where id='63000000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare p text;d jsonb;r jsonb;proof text;begin
 d:=jsonb_build_object('checkoutId','63000000-0000-4000-8000-000000000001','subscriptionId','subscription-qa','paymentId','payment-qa','invoiceId','invoice-qa','status','approved','amountCents',7900,'currency','BRL','periodStart',now(),'periodEnd',now()+interval '1 month','providerUpdatedAt',now());
 for i in 1..2 loop
  p:=jsonb_build_object('operation','payment.sync','nonce',gen_random_uuid(),'timestamp',extract(epoch from clock_timestamp())::bigint,'data',d)::text;
  proof:=encode(extensions.hmac(convert_to(p,'UTF8'),convert_to(repeat('e',64),'UTF8'),'sha256'),'hex');r:=public.forma_billing_server(p,proof);
  if r->>'studioId' is null then raise exception 'Pagamento não criou Studio';end if;
 end loop;
end $$;
reset role;
do $$ begin
 if (select count(*) from forma.studios where name='Empresa QA')<>1 or (select count(*) from forma_billing.payments where provider_id='payment-qa')<>1 then raise exception 'Pagamento duplicou provisionamento';end if;
 if not exists(select 1 from forma_billing.checkouts c join forma.memberships m on m.studio_id=c.studio_id where c.id='63000000-0000-4000-8000-000000000001' and m.account_id=c.owner_id and m.role='admin' and c.coverage_end>now()) then raise exception 'Admin/período incorretos';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","session_id":"62000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare s uuid;w uuid;begin
 s:=(public.forma_billing_account()->'checkouts'->0->>'studio_id')::uuid;
 select id into w from forma.workspaces where studio_id=s limit 1;
 for i in 2..10 loop perform public.forma_work_action(s,'project.create',jsonb_build_object('workspaceId',w,'name','Projeto QA '||i),gen_random_uuid());end loop;
 begin perform public.forma_work_action(s,'project.create',jsonb_build_object('workspaceId',w,'name','Projeto excedente'),gen_random_uuid());raise exception 'Limite de projetos ignorado';exception when check_violation then null;end;
end $$;
do $$ declare s uuid;p uuid;f jsonb;begin
 s:=(public.forma_billing_account()->'checkouts'->0->>'studio_id')::uuid;
 select id into p from forma.projects where studio_id=s limit 1;
 f:=public.forma_work_action(s,'file.reserve',jsonb_build_object('projectId',p,'conversationId',null,'name','quota.txt','mime','text/plain; charset=utf-8','size',1,'sha256',repeat('a',64)),gen_random_uuid());
 if not forma_billing.storage_matches(f->>'object_key','{"contentLength":1,"mimetype":"text/plain"}') then raise exception 'Preflight válido recusado';end if;
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('forma-private',f->>'object_key',forma.actor_id()::text,'{"size":100,"mimetype":"text/plain"}');raise exception 'Storage aceitou bytes acima da reserva';exception when insufficient_privilege then null;end;
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('forma-private',f->>'object_key',forma.actor_id()::text,'{"size":1,"mimetype":"text/plain"}');
 if jsonb_array_length(public.forma_billing_receipts()->'payments')<>1 then raise exception 'Comprovante ausente';end if;
 perform public.forma_billing_request_create(gen_random_uuid(),'enterprise',null,'Proposta QA com mais membros');
 if jsonb_array_length(public.forma_billing_requests())<>1 then raise exception 'Protocolo ausente';end if;
end $$;
reset role;
update forma.memberships set status='removed' where account_id='61000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare s uuid;begin
 if jsonb_array_length(public.forma_billing_receipts()->'payments')<>1 then raise exception 'Ex-membro perdeu comprovante próprio';end if;
 s:=(public.forma_billing_account()->'checkouts'->0->>'studio_id')::uuid;
 begin perform public.forma_work_snapshot(s);raise exception 'Pagador ex-membro acessou trabalho';exception when insufficient_privilege then null;end;
end $$;
reset role;
update forma.memberships set status='active' where account_id='61000000-0000-4000-8000-000000000001';
insert into forma_billing.checkouts(id,owner_id,company,payer_email,quote,terms_version,status,provider_id) select '63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','Empresa cancelada QA','other@billing.invalid',quote,'beta-1','pending','subscription-second' from forma_billing.plan_versions where plan_id='essential' and active;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare p text;proof text;d jsonb;r jsonb;begin
 p:=jsonb_build_object('operation','subscription.sync','nonce',gen_random_uuid(),'timestamp',extract(epoch from clock_timestamp())::bigint,'data',jsonb_build_object('id','63000000-0000-4000-8000-000000000002','providerId','subscription-second','status','cancelled'))::text;
 proof:=encode(extensions.hmac(convert_to(p,'UTF8'),convert_to(repeat('e',64),'UTF8'),'sha256'),'hex');perform public.forma_billing_server(p,proof);
 p:=jsonb_build_object('operation','reconcile.list','nonce',gen_random_uuid(),'timestamp',extract(epoch from clock_timestamp())::bigint,'data','{}'::jsonb)::text;
 proof:=encode(extensions.hmac(convert_to(p,'UTF8'),convert_to(repeat('e',64),'UTF8'),'sha256'),'hex');r:=public.forma_billing_server(p,proof);
 if not exists(select 1 from jsonb_array_elements(r) x where x->>'id'='63000000-0000-4000-8000-000000000002') then raise exception 'Cancelamento abandonou conciliação';end if;
 d:=jsonb_build_object('checkoutId','63000000-0000-4000-8000-000000000002','subscriptionId','subscription-second','paymentId','payment-second','invoiceId','invoice-second','status','approved','amountCents',7900,'currency','BRL','periodStart',now(),'periodEnd',now()+interval '1 month','providerUpdatedAt',now());
 p:=jsonb_build_object('operation','payment.sync','nonce',gen_random_uuid(),'timestamp',extract(epoch from clock_timestamp())::bigint,'data',d)::text;
 proof:=encode(extensions.hmac(convert_to(p,'UTF8'),convert_to(repeat('e',64),'UTF8'),'sha256'),'hex');r:=public.forma_billing_server(p,proof);
 if r->>'studioId' is null then raise exception 'Pagamento aprovado antes de cancelar ficou sem entrega';end if;
end $$;
reset role;
update forma_billing.checkouts set coverage_end=now()-interval '8 days' where id='63000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","session_id":"62000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare s uuid;begin s:=(public.forma_billing_account()->'checkouts'->0->>'studio_id')::uuid;
 begin perform public.forma_work_action(s,'workspace.create','{"name":"Escrita vencida"}',gen_random_uuid());raise exception 'Escrita sem cobertura aceita';exception when insufficient_privilege then null;end;
 if public.forma_work_snapshot(s)->>'studio' is null then raise exception 'Perdeu leitura após vencimento';end if;
end $$;
reset role;
update forma_billing.plan_versions set active=false where plan_id='essential' and version=1;
insert into forma_billing.plan_versions(plan_id,version,name,quote,active) select plan_id,2,name,jsonb_set(jsonb_set(quote,'{priceCents}','9900'),'{version}','2'),true from forma_billing.plan_versions where plan_id='essential' and version=1;
set local role authenticated;
do $$ declare p text;proof text;begin
 if public.forma_billing_plans()->0->>'priceCents'<>'9900' then raise exception 'Catálogo público desatualizado';end if;
 p:=jsonb_build_object('operation','prepare','nonce',gen_random_uuid(),'timestamp',extract(epoch from clock_timestamp())::bigint,'data',jsonb_build_object('requestId','63000000-0000-4000-8000-000000000099','planId','essential','planVersion',1,'company','Novo Studio','termsVersion','beta-1'))::text;
 proof:=encode(extensions.hmac(convert_to(p,'UTF8'),convert_to(repeat('e',64),'UTF8'),'sha256'),'hex');
 begin perform public.forma_billing_server(p,proof);raise exception 'Preço mudou sem novo aceite';exception when serialization_failure then null;end;
end $$;
reset role;
select 'central_billing: OK (rollback)' as result;
rollback;
