-- Teste real e reversível. Todos os dados fictícios são revertidos ao final.
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('10000000-0000-4000-8000-000000000001','admin-a@forma.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000002','coord-a@forma.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000003','new@forma.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000004','admin-b@forma.invalid',now(),'authenticated','authenticated');
insert into auth.sessions(id,user_id) select
 ('20000000-0000-4000-8000-'||right(id::text,12))::uuid,id from auth.users where email like '%@forma.invalid';
insert into forma.studios(id,name) values
 ('30000000-0000-4000-8000-000000000001','Studio A'),('30000000-0000-4000-8000-000000000002','Studio B');
insert into forma.memberships(studio_id,account_id,role) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin'),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','coordinator'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','admin');
insert into forma.invitations(studio_id,recipient_email,role,invited_by,created_at,expires_at) values
 ('30000000-0000-4000-8000-000000000001','expired@forma.invalid','user','10000000-0000-4000-8000-000000000001',now()-interval '8 days',now()-interval '1 day');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if jsonb_array_length(public.forma_account()->'studios')<>1 then raise exception 'Isolamento de Studios falhou'; end if;
 if (select count(*) from forma.studios)<>1 then raise exception 'Studio B visível'; end if;
 perform public.forma_profile_save('Admin A','admin_a');
 perform public.forma_invite('30000000-0000-4000-8000-000000000001','new@forma.invalid','user');
 begin
  perform public.forma_invite('30000000-0000-4000-8000-000000000001','new@forma.invalid','user');
  raise exception 'Convite pendente duplicado';
 exception when unique_violation then null; end;
 begin
  perform public.forma_invite('30000000-0000-4000-8000-000000000002','other@forma.invalid','admin');
  raise exception 'Convite entre Studios aceito';
 exception when insufficient_privilege then null; end;
 begin
  insert into forma.studios(name) values('Studio indevido');
  raise exception 'Criação pública de Studio aceita';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"role":"admin"}}',true);
do $$ begin
 begin
  perform public.forma_invite('30000000-0000-4000-8000-000000000001','other@forma.invalid','admin');
  raise exception 'Coordenador promoveu admin';
 exception when insufficient_privilege then null; end;
 perform public.forma_invite('30000000-0000-4000-8000-000000000001','other@forma.invalid','user');
 -- Expirado de outro gestor pode ser substituído; convite válido não pode.
 perform public.forma_invite('30000000-0000-4000-8000-000000000001','expired@forma.invalid','user');
 begin
  perform public.forma_invitation_revoke((select id from forma.invitations where recipient_email='new@forma.invalid'));
  raise exception 'Coordenador revogou convite válido de outro gestor';
 exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare invitation uuid; begin
 if jsonb_array_length(public.forma_account()->'studios')<>0 then raise exception 'Conta nova ganhou Studio'; end if;
 if jsonb_array_length(public.forma_account()->'invitations')<>1 then raise exception 'Inbox incorreta'; end if;
 if (select count(*) from forma.profiles)<>0 then raise exception 'Perfil sem vínculo vazou'; end if;
 perform public.forma_profile_save('Nova pessoa','new_person');
 select id into invitation from forma.invitations where recipient_email='new@forma.invalid';
 perform public.forma_invitation_respond(invitation,true);
 if jsonb_array_length(public.forma_account()->'studios')<>1 then raise exception 'Aceite não criou associação'; end if;
 if forma.studio_role('30000000-0000-4000-8000-000000000001')<>'user' then raise exception 'Cargo indevido'; end if;
 begin
  update forma.memberships set role='admin' where account_id=forma.actor_id();
  raise exception 'Autopromoção aceita';
 exception when insufficient_privilege then null; end;
 begin
  perform public.forma_invitation_respond(invitation,true);
  raise exception 'Aceite duplicado';
 exception when no_data_found then null; end;
end $$;
reset role;
-- Convite criado por gestor que depois perdeu acesso não concede associação.
insert into forma.invitations(studio_id,recipient_email,role,invited_by) values
 ('30000000-0000-4000-8000-000000000002','new@forma.invalid','admin','10000000-0000-4000-8000-000000000004');
update forma.memberships set status='suspended' where account_id='10000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ declare invitation uuid; begin
 select id into invitation from forma.invitations where studio_id='30000000-0000-4000-8000-000000000002';
 begin
  perform public.forma_invitation_respond(invitation,true); raise exception 'Emissor suspenso concedeu acesso';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from forma.memberships where studio_id='30000000-0000-4000-8000-000000000002') then raise exception 'Associação indevida'; end if;
end $$;
reset role;
delete from auth.sessions where user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 begin
  perform public.forma_account(); raise exception 'Sessão revogada aceita';
 exception when invalid_authorization_specification then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform public.forma_account(); raise exception 'Anônimo aceito';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'central_identity: OK (rollback)' as result;
