begin;

create table public.guide_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (follower_id, owner_id),
  check (follower_id <> owner_id)
);
create index guide_follows_owner on public.guide_follows(owner_id);
alter table public.guide_follows enable row level security;
revoke all on public.guide_follows from public, anon, authenticated;
grant select, insert, delete on public.guide_follows to authenticated;
grant update (approved) on public.guide_follows to authenticated;

create policy "Participants see their connections" on public.guide_follows
  for select to authenticated using (auth.uid() in (owner_id, follower_id));
create policy "Followers request access" on public.guide_follows
  for insert to authenticated with check (follower_id = auth.uid() and not approved);
create policy "Only owners approve" on public.guide_follows
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Participants remove access" on public.guide_follows
  for delete to authenticated using (auth.uid() in (owner_id, follower_id));

-- Exact username lookup exposes only the requested person's display identity.
create function public.request_guide_follow(p_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare friend public.profiles; accepted boolean;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and username is not null) then
    raise exception 'profile_required';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'friend_not_found'; end if;
  select * into friend from public.profiles where username = p_username;
  if not found then raise exception 'friend_not_found'; end if;
  if friend.id = auth.uid() then raise exception 'cannot_follow_self'; end if;
  insert into public.guide_follows (follower_id, owner_id) values (auth.uid(), friend.id)
    on conflict (follower_id, owner_id) do nothing;
  select approved into accepted from public.guide_follows where follower_id = auth.uid() and owner_id = friend.id;
  return jsonb_build_object('id', friend.id, 'display_name', friend.display_name, 'username', friend.username, 'approved', accepted);
end;
$$;

create function public.guide_connections()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'following', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.owner_id where f.follower_id = auth.uid() and f.approved), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.owner_id where f.follower_id = auth.uid() and not f.approved), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.follower_id where f.owner_id = auth.uid() and not f.approved), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.follower_id where f.owner_id = auth.uid() and f.approved), '[]'::jsonb)
  );
$$;

-- Raw private_guides remains owner-only. This read checks approval and removes hidden entries in one query.
create function public.get_followed_guide(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('owner', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username),
    'revision', coalesce(g.revision, 0),
    'places', coalesce((select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(g.places, '[]'::jsonb)) with ordinality as entry(item, ordinal)
      where item->'inGuide' = 'true'::jsonb or (not (item ? 'inGuide') and item->'recommended' = 'true'::jsonb)), '[]'::jsonb))
  into result from public.guide_follows f
  join public.profiles p on p.id = f.owner_id
  left join public.private_guides g on g.owner_id = f.owner_id
  where f.follower_id = auth.uid() and f.owner_id = p_owner and f.approved;
  if result is null then raise exception 'guide_access_denied'; end if;
  return result;
end;
$$;

revoke all on function public.request_guide_follow(text), public.guide_connections(), public.get_followed_guide(uuid) from public, anon;
grant execute on function public.request_guide_follow(text), public.guide_connections(), public.get_followed_guide(uuid) to authenticated;
commit;
