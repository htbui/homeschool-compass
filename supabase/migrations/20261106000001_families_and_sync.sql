-- Kinship: families, membership, invites, and the synced family workspace.
--
-- Each signed-in parent belongs to one family. The family's planner data
-- (children, rhythm, tasks, records…) is one JSON document in `workspaces`,
-- versioned so devices can sync with optimistic concurrency and merge
-- concurrent edits client-side. Shared, multi-family data (marketplace,
-- community) lives in normal tables in later migrations.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── Families

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'parent' check (role in ('owner', 'parent')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
-- One family per account keeps "my family" unambiguous on every device.
create unique index family_members_one_family_per_user on public.family_members (user_id);

create or replace function public.is_family_member(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid()
  );
$$;

create or replace function public.my_family_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select family_id from public.family_members where user_id = auth.uid();
$$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;

create policy "members read their family" on public.families
  for select to authenticated using (public.is_family_member(id));
create policy "members rename their family" on public.families
  for update to authenticated using (public.is_family_member(id)) with check (public.is_family_member(id));
create policy "members see who is in their family" on public.family_members
  for select to authenticated using (public.is_family_member(family_id));

grant select, update on public.families to authenticated;
grant select on public.family_members to authenticated;

-- ───────────────────────────── Workspace (synced planner data)

create table public.workspaces (
  family_id uuid primary key references public.families (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.workspaces enable row level security;
create policy "members read their workspace" on public.workspaces
  for select to authenticated using (public.is_family_member(family_id));
grant select on public.workspaces to authenticated;
-- Writes go through push_workspace() so the version check can't be skipped.

alter publication supabase_realtime add table public.workspaces;

-- Create a family for the signed-in user, seeded with this device's data.
create or replace function public.create_family(family_name text, initial_data jsonb default '{}'::jsonb)
returns table (family_id uuid, version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a family' using errcode = '23505';
  end if;
  insert into public.families (name, created_by) values (family_name, auth.uid()) returning id into fid;
  insert into public.family_members (family_id, user_id, role) values (fid, auth.uid(), 'owner');
  insert into public.workspaces (family_id, data, version, updated_by) values (fid, coalesce(initial_data, '{}'::jsonb), 1, auth.uid());
  return query select fid, 1::bigint;
end;
$$;

-- Optimistic write: succeeds only if the caller saw the latest version.
-- On conflict, returns the current server copy so the client can merge.
create or replace function public.push_workspace(fid uuid, base_version bigint, new_data jsonb)
returns table (ok boolean, version bigint, data jsonb)
language plpgsql security definer set search_path = ''
as $$
declare
  v bigint;
begin
  if not public.is_family_member(fid) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;
  if pg_column_size(new_data) > 8 * 1024 * 1024 then
    raise exception 'Workspace is too large' using errcode = '54000';
  end if;
  update public.workspaces w
     set data = new_data, version = w.version + 1, updated_at = now(), updated_by = auth.uid()
   where w.family_id = fid and w.version = base_version
  returning w.version into v;
  if found then
    return query select true, v, null::jsonb;
  else
    return query select false, w.version, w.data from public.workspaces w where w.family_id = fid;
  end if;
end;
$$;

-- ───────────────────────────── Invites (a second parent, or another device's account)

create table public.family_invites (
  code text primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

alter table public.family_invites enable row level security;
create policy "members see their invites" on public.family_invites
  for select to authenticated using (public.is_family_member(family_id));
create policy "members revoke their invites" on public.family_invites
  for delete to authenticated using (public.is_family_member(family_id));
grant select, delete on public.family_invites to authenticated;

create or replace function public.create_family_invite()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  if fid is null then
    raise exception 'Create or join a family first' using errcode = '42501';
  end if;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.family_invites where code = c);
  end loop;
  insert into public.family_invites (code, family_id) values (c, fid);
  return c;
end;
$$;

create or replace function public.join_family(invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.family_invites;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  select * into inv from public.family_invites where code = upper(trim(invite_code)) for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'That invite code is invalid or expired' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a family' using errcode = '23505';
  end if;
  insert into public.family_members (family_id, user_id, role) values (inv.family_id, auth.uid(), 'parent');
  update public.family_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.family_id;
end;
$$;

-- Leave the family; the last member leaving deletes it and its data.
create or replace function public.leave_family()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
begin
  if fid is null then
    return;
  end if;
  delete from public.family_members where family_id = fid and user_id = auth.uid();
  if not exists (select 1 from public.family_members where family_id = fid) then
    delete from public.families where id = fid;
  end if;
end;
$$;

revoke all on function public.create_family(text, jsonb) from public, anon;
revoke all on function public.push_workspace(uuid, bigint, jsonb) from public, anon;
revoke all on function public.create_family_invite() from public, anon;
revoke all on function public.join_family(text) from public, anon;
revoke all on function public.leave_family() from public, anon;
grant execute on function public.create_family(text, jsonb), public.push_workspace(uuid, bigint, jsonb), public.create_family_invite(), public.join_family(text), public.leave_family() to authenticated;

-- ───────────────────────────── Family media (portfolio photos, receipts)

create or replace function public.try_uuid(s text)
returns uuid
language plpgsql immutable
as $$
begin
  return s::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-media', 'family-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

-- Objects are stored under "<family id>/…" and only that family can touch them.
create policy "family reads its media" on storage.objects
  for select to authenticated using (bucket_id = 'family-media' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
create policy "family uploads its media" on storage.objects
  for insert to authenticated with check (bucket_id = 'family-media' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
create policy "family replaces its media" on storage.objects
  for update to authenticated using (bucket_id = 'family-media' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
create policy "family deletes its media" on storage.objects
  for delete to authenticated using (bucket_id = 'family-media' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
