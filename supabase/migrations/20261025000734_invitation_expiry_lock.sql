-- Somente convites expirados de terceiros entram na limpeza pelo coordenador.
create policy invitations_expired_read on forma.invitations for select to authenticated
 using (status='pending' and expires_at<=now() and forma.studio_role(studio_id)='coordinator');
create policy invitations_expired_revoke on forma.invitations for update to authenticated
 using (status='pending' and expires_at<=now() and forma.studio_role(studio_id)='coordinator')
 with check (status='revoked');

-- Lock compartilhado do emissor ordena aceite com suspensão/remoção concorrente.
-- Continua sendo helper privado, sem modificar linha nem conceder privilégios.
create or replace function forma.can_accept(target uuid,assigned_role text) returns boolean
 language plpgsql volatile security definer set search_path='' as $$
declare permitted boolean:=false;
begin
 if forma.actor_id() is null then return false; end if;
 select true into permitted from forma.invitations i join forma.memberships issuer
 on issuer.studio_id=i.studio_id and issuer.account_id=i.invited_by
 where i.studio_id=target and i.recipient_email=forma.actor_email()
 and i.role=assigned_role and i.status='pending' and i.expires_at>now()
 and issuer.status='active' and (issuer.role='admin' or issuer.role='coordinator' and i.role='user')
 for share of issuer;
 return coalesce(permitted,false);
end $$;
revoke all on function forma.can_accept(uuid,text) from public,anon;
grant execute on function forma.can_accept(uuid,text) to authenticated;
