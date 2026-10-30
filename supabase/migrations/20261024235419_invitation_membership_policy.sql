-- Lookup privado: a política de INSERT não pode consultar memberships novamente
-- sob RLS, pois isso causa recursão até mesmo em um EXISTS sobre o emissor.
create function forma.can_accept(target uuid,assigned_role text) returns boolean
 language sql stable security definer set search_path='' as $$
 select forma.actor_id() is not null and exists (
 select 1 from forma.invitations i join forma.memberships issuer
 on issuer.studio_id=i.studio_id and issuer.account_id=i.invited_by
 where i.studio_id=target and i.recipient_email=forma.actor_email()
 and i.role=assigned_role and i.status='pending' and i.expires_at>now()
 and issuer.status='active' and (issuer.role='admin' or issuer.role='coordinator' and i.role='user'))
$$;
revoke all on function forma.can_accept(uuid,text) from public,anon;
grant execute on function forma.can_accept(uuid,text) to authenticated;
drop policy memberships_accept on forma.memberships;
create policy memberships_accept on forma.memberships for insert to authenticated
 with check (account_id=(select forma.actor_id()) and status='active' and forma.can_accept(studio_id,role));
