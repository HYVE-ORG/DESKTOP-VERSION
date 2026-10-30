-- Forma: domínio privado. Não importar state.json, senhas ou sessões locais.
create schema forma;
revoke all on schema forma from public, anon;
grant usage on schema forma to authenticated;
alter default privileges in schema forma revoke execute on functions from public;

create table forma.profiles (
 account_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 80),
 handle text not null unique check (handle ~ '^[a-z0-9_]{3,40}$'),
 bio text not null default '' check (char_length(bio)<=600),
 title text not null default '' check (char_length(title)<=100),
 location text not null default '' check (char_length(location)<=120),
 created_at timestamptz not null default now()
);
create table forma.studios (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 2 and 80),
 created_at timestamptz not null default now()
);
create table forma.memberships (
 studio_id uuid not null references forma.studios(id) on delete cascade,
 account_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','coordinator','user')),
 status text not null default 'active' check (status in ('active','suspended','removed')),
 created_at timestamptz not null default now(),
 primary key(studio_id,account_id)
);
create index memberships_account_idx on forma.memberships(account_id,studio_id) where status='active';
create table forma.invitations (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null references forma.studios(id) on delete cascade,
 recipient_email text not null check (recipient_email=lower(btrim(recipient_email)) and char_length(recipient_email)<=200 and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 role text not null check (role in ('admin','coordinator','user')),
 invited_by uuid not null references auth.users(id),
 status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 responded_at timestamptz,
 check (expires_at>created_at)
);
create unique index invitations_pending_unique on forma.invitations(studio_id,recipient_email) where status='pending';
create index invitations_recipient_idx on forma.invitations(recipient_email,status);
create index invitations_inviter_idx on forma.invitations(invited_by);

-- Helpers de leitura privilegiada evitam recursão de RLS. Nenhuma escrita.
-- Tokens de sessão revogada/de conta bloqueada deixam de autorizar imediatamente.
create function forma.actor_id() returns uuid language sql stable security definer set search_path='' as $$
 select u.id from auth.users u
 join auth.sessions s on s.user_id=u.id
 where u.id=(select auth.uid()) and s.id::text=(select auth.jwt()->>'session_id')
 and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now())
 and (s.not_after is null or s.not_after>now())
 limit 1
$$;
create function forma.actor_email() returns text language sql stable security definer set search_path='' as $$
 select lower(u.email) from auth.users u where u.id=(select forma.actor_id())
$$;
create function forma.studio_role(target uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from forma.memberships m where m.studio_id=target
 and m.account_id=(select forma.actor_id()) and m.status='active'
$$;
revoke all on function forma.actor_id(),forma.actor_email(),forma.studio_role(uuid) from public,anon;
grant execute on function forma.actor_id(),forma.actor_email(),forma.studio_role(uuid) to authenticated;

alter table forma.profiles enable row level security;
alter table forma.studios enable row level security;
alter table forma.memberships enable row level security;
alter table forma.invitations enable row level security;
alter table forma.profiles force row level security;
alter table forma.studios force row level security;
alter table forma.memberships force row level security;
alter table forma.invitations force row level security;

grant select,insert on forma.profiles to authenticated;
grant update(name,handle,bio,title,location) on forma.profiles to authenticated;
grant select on forma.studios to authenticated;
grant select,insert on forma.memberships to authenticated;
grant select,insert on forma.invitations to authenticated;
grant update(status,responded_at) on forma.invitations to authenticated;

create policy profiles_read on forma.profiles for select to authenticated using (
 account_id=(select forma.actor_id()) or exists (
 select 1 from forma.memberships m where m.account_id=profiles.account_id
 and m.status='active' and forma.studio_role(m.studio_id) is not null));
create policy profiles_create on forma.profiles for insert to authenticated with check (account_id=(select forma.actor_id()));
create policy profiles_edit on forma.profiles for update to authenticated
 using (account_id=(select forma.actor_id())) with check (account_id=(select forma.actor_id()));
create policy memberships_read on forma.memberships for select to authenticated using (
 account_id=(select forma.actor_id()) or forma.studio_role(studio_id) is not null);
create policy studios_read on forma.studios for select to authenticated using (
 forma.studio_role(id) is not null or exists (select 1 from forma.invitations i
 where i.studio_id=studios.id and i.recipient_email=(select forma.actor_email())
 and i.status='pending' and i.expires_at>now()));
create policy invitations_read on forma.invitations for select to authenticated using (
 recipient_email=(select forma.actor_email()) or forma.studio_role(studio_id)='admin'
 or invited_by=(select forma.actor_id()) and forma.studio_role(studio_id)='coordinator');
create policy invitations_create on forma.invitations for insert to authenticated with check (
 invited_by=(select forma.actor_id()) and status='pending' and responded_at is null
 and expires_at<=now()+interval '7 days'
 and (forma.studio_role(studio_id)='admin' or forma.studio_role(studio_id)='coordinator' and role='user'));
create policy invitations_respond on forma.invitations for update to authenticated
 using (recipient_email=(select forma.actor_email()) and status='pending' and expires_at>now())
 with check (recipient_email=(select forma.actor_email()) and status in ('accepted','declined'));
create policy invitations_revoke on forma.invitations for update to authenticated
 using (status='pending' and (forma.studio_role(studio_id)='admin'
 or invited_by=(select forma.actor_id()) and forma.studio_role(studio_id)='coordinator'))
 with check (status='revoked');
create policy memberships_accept on forma.memberships for insert to authenticated with check (
 account_id=(select forma.actor_id()) and status='active' and exists (
 select 1 from forma.invitations i where i.studio_id=memberships.studio_id
 and i.recipient_email=(select forma.actor_email()) and i.role=memberships.role
 and i.status='pending' and i.expires_at>now()
 -- Convite pendente não sobrevive à perda de autoridade do emissor.
 and exists (select 1 from forma.memberships issuer where issuer.studio_id=i.studio_id
 and issuer.account_id=i.invited_by and issuer.status='active'
 and (issuer.role='admin' or issuer.role='coordinator' and i.role='user'))));

create function public.forma_account() returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=forma.actor_id(); result jsonb;
begin
 if actor is null then raise sqlstate '28000' using message='Sessão inválida.'; end if;
 select jsonb_build_object(
 'profile',(select to_jsonb(p) from forma.profiles p where p.account_id=actor),
 'studios',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'role',m.role) order by s.name,s.id)
 from forma.memberships m join forma.studios s on s.id=m.studio_id where m.account_id=actor and m.status='active'),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'studioId',i.studio_id,'studioName',s.name,'role',i.role,'expiresAt',i.expires_at) order by i.created_at desc,i.id)
 from forma.invitations i join forma.studios s on s.id=i.studio_id where i.recipient_email=forma.actor_email()
 and i.status='pending' and i.expires_at>now()),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.forma_profile_save(p_name text,p_handle text,p_bio text default '',p_title text default '',p_location text default '')
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=forma.actor_id();
begin
 if actor is null then raise sqlstate '28000' using message='Sessão inválida.'; end if;
 insert into forma.profiles(account_id,name,handle,bio,title,location) values(actor,btrim(p_name),lower(btrim(p_handle)),p_bio,p_title,p_location)
 on conflict(account_id) do update set name=excluded.name,handle=excluded.handle,bio=excluded.bio,title=excluded.title,location=excluded.location;
 return public.forma_account();
end $$;
create function public.forma_invite(p_studio uuid,p_email text,p_role text default 'user')
 returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if forma.actor_id() is null then raise sqlstate '28000' using message='Sessão inválida.'; end if;
 if forma.studio_role(p_studio) is null then raise insufficient_privilege; end if;
 -- Expirados deixam de ocupar a chave de convite pendente.
 update forma.invitations set status='revoked',responded_at=now() where studio_id=p_studio
 and recipient_email=lower(btrim(p_email)) and status='pending' and expires_at<=now();
 insert into forma.invitations(studio_id,recipient_email,role,invited_by)
 values(p_studio,lower(btrim(p_email)),p_role,forma.actor_id()) returning id into result;
 return result;
end $$;
create function public.forma_invitation_respond(p_id uuid,p_accept boolean)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare invitation forma.invitations; actor uuid:=forma.actor_id();
begin
 if actor is null then raise sqlstate '28000' using message='Sessão inválida.'; end if;
 select * into invitation from forma.invitations where id=p_id and recipient_email=forma.actor_email()
 and status='pending' and expires_at>now() for update;
 if not found then raise sqlstate 'P0002' using message='Convite indisponível.'; end if;
 if p_accept then
  -- Nunca reativar/promover associação existente por aceite de convite.
  if exists(select 1 from forma.memberships where studio_id=invitation.studio_id and account_id=actor) then
   raise sqlstate '23505' using message='Associação já existente.';
  end if;
  insert into forma.memberships(studio_id,account_id,role) values(invitation.studio_id,actor,invitation.role);
 end if;
 update forma.invitations set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now() where id=p_id;
 return public.forma_account();
end $$;
create function public.forma_invitation_revoke(p_id uuid) returns boolean
 language plpgsql security invoker set search_path='' as $$
begin
 if forma.actor_id() is null then raise sqlstate '28000' using message='Sessão inválida.'; end if;
 update forma.invitations set status='revoked',responded_at=now() where id=p_id and status='pending'
 and (forma.studio_role(studio_id)='admin' or invited_by=forma.actor_id() and forma.studio_role(studio_id)='coordinator');
 if not found then raise sqlstate 'P0002' using message='Convite indisponível.'; end if;
 return true;
end $$;
revoke all on function public.forma_account(),public.forma_profile_save(text,text,text,text,text),public.forma_invite(uuid,text,text),public.forma_invitation_respond(uuid,boolean),public.forma_invitation_revoke(uuid) from public,anon;
grant execute on function public.forma_account(),public.forma_profile_save(text,text,text,text,text),public.forma_invite(uuid,text,text),public.forma_invitation_respond(uuid,boolean),public.forma_invitation_revoke(uuid) to authenticated;
