begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Your guide' check (char_length(display_name) between 1 and 80),
  username text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.private_guides (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  places jsonb not null default '[]'::jsonb
    check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) <= 2000),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.private_guides enable row level security;
revoke all on public.profiles, public.private_guides from anon;
grant select, insert, update, delete on public.profiles, public.private_guides to authenticated;

create policy "Owners manage their private profile" on public.profiles
  for all to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Owners manage their private guide" on public.private_guides
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- One transaction writes a complete guide. A stale client cannot overwrite a newer revision.
create or replace function public.save_my_guide(p_places jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required';
  end if;
  if jsonb_typeof(p_places) is distinct from 'array'
     or jsonb_array_length(p_places) > 2000
     or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_guide';
  end if;
  if p_expected_revision = 0 then
    insert into public.private_guides (owner_id, places, revision)
    values (auth.uid(), p_places, 1)
    on conflict (owner_id) do nothing
    returning revision into saved_revision;
  else
    update public.private_guides set places = p_places, revision = revision + 1, updated_at = now()
    where owner_id = auth.uid() and revision = p_expected_revision
    returning revision into saved_revision;
  end if;
  if saved_revision is null then
    raise exception 'guide_conflict';
  end if;
  return jsonb_build_object('revision', saved_revision);
end;
$$;
revoke all on function public.save_my_guide(jsonb, bigint) from public, anon;
grant execute on function public.save_my_guide(jsonb, bigint) to authenticated;

commit;
