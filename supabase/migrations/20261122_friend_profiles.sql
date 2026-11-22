begin;

alter table public.profiles
  add column bio text not null default ''
    constraint profiles_bio_length check (char_length(bio) <= 160),
  add column photo_data text
    constraint profiles_photo_jpeg check (
      photo_data is null or (
        char_length(photo_data) <= 120023
        and mod(char_length(photo_data) - 23, 4) = 0
        and photo_data ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$'
      )
    );

-- Exact identity lookup has no side effects. Only an approved guide reader gets
-- the profile details. Photos are fetched separately, never in a list response.
create function public.lookup_guide_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  result jsonb;
begin
  if viewer is null then raise exception 'sign_in_required'; end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'friend_not_found';
  end if;
  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username,
    'connection_status', case when f.approved then 'approved' when f.follower_id is not null then 'pending' else 'none' end)
    || case when f.approved then jsonb_build_object('bio', p.bio, 'has_photo', p.photo_data is not null)
      else '{}'::jsonb end
  into result from public.profiles p
  left join public.guide_follows f on f.owner_id = p.id and f.follower_id = viewer
  where p.username = p_username;
  if result is null then raise exception 'friend_not_found'; end if;
  if (result->>'id')::uuid = viewer then raise exception 'cannot_follow_self'; end if;
  return result;
end;
$$;

-- A username can change between preview and confirmation. The expected ID
-- binds the request to the profile that was actually previewed.
create function public.request_guide_follow(p_username text, p_expected_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  friend record;
  accepted boolean;
begin
  if viewer is null then raise exception 'sign_in_required'; end if;
  if not exists (select 1 from public.profiles where id = viewer and username is not null) then
    raise exception 'profile_required';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'friend_not_found';
  end if;
  select id, display_name, username into friend from public.profiles
  where username = p_username and (p_expected_id is null or id = p_expected_id);
  if not found then raise exception 'friend_not_found'; end if;
  if friend.id = viewer then raise exception 'cannot_follow_self'; end if;
  insert into public.guide_follows (follower_id, owner_id) values (viewer, friend.id)
    on conflict (follower_id, owner_id) do nothing;
  select approved into accepted from public.guide_follows where follower_id = viewer and owner_id = friend.id;
  return jsonb_build_object('id', friend.id, 'display_name', friend.display_name, 'username', friend.username, 'approved', accepted);
end;
$$;

create or replace function public.request_guide_follow(p_username text)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.request_guide_follow(p_username, null::uuid);
$$;

create or replace function public.guide_connections()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'following', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username,
      'bio', p.bio, 'has_photo', p.photo_data is not null) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.owner_id where f.follower_id = auth.uid() and f.approved), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.owner_id where f.follower_id = auth.uid() and not f.approved), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.follower_id where f.owner_id = auth.uid() and not f.approved), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username) order by p.username)
      from public.guide_follows f join public.profiles p on p.id = f.follower_id where f.owner_id = auth.uid() and f.approved), '[]'::jsonb)
  );
$$;

create or replace function public.get_followed_guide(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('owner', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username,
    'bio', p.bio, 'has_photo', p.photo_data is not null),
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

create function public.get_guide_profile_photo(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  result jsonb;
begin
  select jsonb_build_object('photo_data', p.photo_data) into result
  from public.profiles p
  where p.id = p_owner and (p.id = viewer or exists (
    select 1 from public.guide_follows f where f.follower_id = viewer and f.owner_id = p.id and f.approved
  ));
  if result is null then raise exception 'guide_access_denied'; end if;
  return result;
end;
$$;

revoke all on function public.lookup_guide_profile(text), public.request_guide_follow(text, uuid),
  public.request_guide_follow(text), public.guide_connections(), public.get_followed_guide(uuid),
  public.get_guide_profile_photo(uuid) from public, anon;
grant execute on function public.lookup_guide_profile(text), public.request_guide_follow(text, uuid),
  public.request_guide_follow(text), public.guide_connections(), public.get_followed_guide(uuid),
  public.get_guide_profile_photo(uuid) to authenticated;

commit;
