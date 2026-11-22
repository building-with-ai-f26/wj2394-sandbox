-- Run after 20261122_friend_profiles.sql. All records are disposable and roll back.
begin;

insert into auth.users (id, email) values
  ('7e01ff2f-b906-46f4-8d52-2b5017195511','friend-profile-owner@example.com'),
  ('7e01ff2f-b906-46f4-8d52-2b5017195512','friend-profile-reader@example.com'),
  ('7e01ff2f-b906-46f4-8d52-2b5017195513','friend-profile-outsider@example.com');

insert into public.profiles (id, display_name, username, bio, photo_data) values
  ('7e01ff2f-b906-46f4-8d52-2b5017195511','Venue fixture owner','test_profile_owner',
    'My NYC place notes.', 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD80qKKK/qs8Q//2Q=='),
  ('7e01ff2f-b906-46f4-8d52-2b5017195512','Venue fixture reader','test_profile_reader','Reader profile.',null),
  ('7e01ff2f-b906-46f4-8d52-2b5017195513','Venue fixture outsider','test_profile_outsider','',null);

insert into public.private_guides (owner_id, places) values
  ('7e01ff2f-b906-46f4-8d52-2b5017195511',
    '[{"id":"via-carota","name":"Via Carota","inGuide":true},{"id":"pier-1","name":"Brooklyn Bridge Park, Pier 1","inGuide":false}]');

do $$ begin
  if has_function_privilege('anon', 'public.lookup_guide_profile(text)', 'execute')
    or has_function_privilege('anon', 'public.get_guide_profile_photo(uuid)', 'execute')
    or has_function_privilege('anon', 'public.request_guide_follow(text,uuid)', 'execute') then
    raise exception 'test_failed_anonymous_grant';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195512';
do $$ declare preview jsonb; outgoing jsonb; begin
  preview := public.lookup_guide_profile('test_profile_owner');
  if preview->>'connection_status' is distinct from 'none'
    or preview->>'username' is distinct from 'test_profile_owner'
    or preview ?| array['bio','has_photo','photo_data'] then
    raise exception 'test_failed_exact_identity_preview';
  end if;
  if exists (select 1 from public.guide_follows) then
    raise exception 'test_failed_preview_created_request';
  end if;
  begin
    perform public.request_guide_follow('test_profile_owner', '7e01ff2f-b906-46f4-8d52-2b5017195513');
    raise exception 'test_failed_wrong_preview_identity';
  exception when raise_exception then
    if sqlerrm <> 'friend_not_found' then raise; end if;
  end;
  perform public.request_guide_follow('test_profile_owner','7e01ff2f-b906-46f4-8d52-2b5017195511');
  preview := public.lookup_guide_profile('test_profile_owner');
  outgoing := public.guide_connections()->'outgoing'->0;
  if preview->>'connection_status' is distinct from 'pending'
    or preview ?| array['bio','has_photo','photo_data']
    or outgoing->>'username' is distinct from 'test_profile_owner'
    or outgoing ?| array['bio','has_photo','photo_data'] then
    raise exception 'test_failed_pending_profile_leak';
  end if;
  begin
    perform public.get_guide_profile_photo('7e01ff2f-b906-46f4-8d52-2b5017195511');
    raise exception 'test_failed_pending_avatar_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
end $$;

set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195511';
update public.guide_follows set approved = true where owner_id = auth.uid();
do $$ declare profile_photo jsonb; follower jsonb; begin
  select to_jsonb(photo_data) into strict profile_photo from public.profiles where id = auth.uid();
  if public.get_guide_profile_photo(auth.uid())->'photo_data' is distinct from profile_photo then
    raise exception 'test_failed_owner_avatar_read';
  end if;
  begin
    update public.profiles set photo_data = 'data:image/svg+xml;base64,PHN2Zz4=' where id = auth.uid();
    raise exception 'test_failed_disallowed_photo_type';
  exception when check_violation then
    null;
  end;
  follower := public.guide_connections()->'followers'->0;
  if follower->>'username' is distinct from 'test_profile_reader'
    or follower ?| array['bio','has_photo','photo_data'] then
    raise exception 'test_failed_reverse_direction_profile_leak';
  end if;
  begin
    perform public.get_guide_profile_photo('7e01ff2f-b906-46f4-8d52-2b5017195512');
    raise exception 'test_failed_reverse_direction_avatar_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
end $$;

set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195512';
do $$ declare preview jsonb; guide jsonb; following jsonb; begin
  preview := public.lookup_guide_profile('test_profile_owner');
  guide := public.get_followed_guide('7e01ff2f-b906-46f4-8d52-2b5017195511');
  following := public.guide_connections()->'following'->0;
  if preview->>'connection_status' is distinct from 'approved'
    or preview->>'bio' is distinct from 'My NYC place notes.'
    or preview->'has_photo' is distinct from 'true'::jsonb
    or preview ? 'photo_data'
    or following->>'bio' is distinct from preview->>'bio'
    or following->'has_photo' is distinct from 'true'::jsonb
    or following ? 'photo_data'
    or guide->'owner' is distinct from following
    or guide->'places'->0->>'id' is distinct from 'via-carota'
    or jsonb_array_length(guide->'places') is distinct from 1 then
    raise exception 'test_failed_approved_profile_or_guide';
  end if;
  if public.get_guide_profile_photo('7e01ff2f-b906-46f4-8d52-2b5017195511')->>'photo_data' is null then
    raise exception 'test_failed_approved_avatar_read';
  end if;
  if exists (select 1 from public.profiles where id <> auth.uid()) then
    raise exception 'test_failed_raw_profile_read';
  end if;
end $$;

set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195513';
do $$ declare preview jsonb; begin
  preview := public.lookup_guide_profile('test_profile_owner');
  if preview->>'connection_status' is distinct from 'none'
    or preview ?| array['bio','has_photo','photo_data'] then
    raise exception 'test_failed_outsider_profile_leak';
  end if;
  begin
    perform public.get_guide_profile_photo('7e01ff2f-b906-46f4-8d52-2b5017195511');
    raise exception 'test_failed_outsider_avatar_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
end $$;

set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195511';
update public.profiles set photo_data = null where id = auth.uid();
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195512';
do $$ begin
  if public.lookup_guide_profile('test_profile_owner')->'has_photo' is distinct from 'false'::jsonb
    or public.get_guide_profile_photo('7e01ff2f-b906-46f4-8d52-2b5017195511')->'photo_data' is distinct from 'null'::jsonb then
    raise exception 'test_failed_owner_avatar_removal';
  end if;
end $$;

set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195511';
delete from public.guide_follows where owner_id = auth.uid();
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195512';
do $$ begin
  if public.lookup_guide_profile('test_profile_owner') ? 'bio'
    or public.guide_connections()->'following' is distinct from '[]'::jsonb then
    raise exception 'test_failed_revoked_profile_leak';
  end if;
  begin
    perform public.get_guide_profile_photo('7e01ff2f-b906-46f4-8d52-2b5017195511');
    raise exception 'test_failed_revoked_avatar_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
end $$;

rollback;
