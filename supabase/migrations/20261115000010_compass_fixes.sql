-- Compass fixes found by the Compass test suite (supabase/tests/compass.test.ts).

-- 1. Members could update every column of their family row, including
--    `created_by` (an `on delete cascade` reference: pointing it at another
--    account would delete the whole family when that account is deleted) and
--    `created_at`. Renaming is the only edit the app makes.
revoke update on public.families from authenticated;
grant update (name) on public.families to authenticated;

-- 2. The workspace must stay a JSON object: every device reads it as one, so a
--    stray array or string pushed by a broken client would break the app for
--    the whole family on their next sync.
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
  if new_data is null or jsonb_typeof(new_data) <> 'object' then
    raise exception 'Workspace must be a JSON object' using errcode = '22023';
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
  if initial_data is not null and jsonb_typeof(initial_data) <> 'object' then
    raise exception 'Workspace must be a JSON object' using errcode = '22023';
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

revoke all on function public.create_family(text, jsonb) from public, anon;
revoke all on function public.push_workspace(uuid, bigint, jsonb) from public, anon;
grant execute on function public.create_family(text, jsonb), public.push_workspace(uuid, bigint, jsonb) to authenticated;
