-- No real users or guides are touched. All three test accounts roll back.
begin;
insert into auth.users (id, email) values
  ('7e01ff2f-b906-46f4-8d52-2b5017195501','inner-table-owner@example.com'),
  ('7e01ff2f-b906-46f4-8d52-2b5017195502','inner-table-friend@example.com'),
  ('7e01ff2f-b906-46f4-8d52-2b5017195503','inner-table-outsider@example.com');
insert into public.profiles (id, display_name, username) values
  ('7e01ff2f-b906-46f4-8d52-2b5017195501','Fictional Owner','test_fixture_owner'),
  ('7e01ff2f-b906-46f4-8d52-2b5017195502','Fictional Friend','test_fixture_friend'),
  ('7e01ff2f-b906-46f4-8d52-2b5017195503','Fictional Outsider','test_fixture_outsider');
insert into public.private_guides (owner_id, places) values
  ('7e01ff2f-b906-46f4-8d52-2b5017195501','[{"id":"visible","inGuide":true,"note":"Visible note","status":"not specified"},{"id":"hidden","inGuide":false,"note":"Private note"}]');
set local role authenticated;
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195502';
select public.request_guide_follow('test_fixture_owner');
do $$ begin
  begin
    perform public.get_followed_guide('7e01ff2f-b906-46f4-8d52-2b5017195501');
    raise exception 'test_failed_pending_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
  update public.guide_follows set approved = true where follower_id = auth.uid();
  if found then raise exception 'test_failed_self_approval'; end if;
end $$;
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195501';
update public.guide_follows set approved = true where owner_id = auth.uid();
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195502';
do $$ declare shared jsonb; begin
  shared := public.get_followed_guide('7e01ff2f-b906-46f4-8d52-2b5017195501');
  if jsonb_array_length(shared->'places') <> 1 or shared->'places'->0->>'id' <> 'visible' then
    raise exception 'test_failed_hidden_place_leak';
  end if;
  if shared->'places'->0->>'status' <> 'not specified' then raise exception 'test_failed_visit_status'; end if;
  if exists (select 1 from public.private_guides) then raise exception 'test_failed_raw_guide_read'; end if;
end $$;
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195503';
do $$ begin
  begin
    perform public.get_followed_guide('7e01ff2f-b906-46f4-8d52-2b5017195501');
    raise exception 'test_failed_outsider_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
end $$;
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195501';
delete from public.guide_follows where owner_id = auth.uid();
set local request.jwt.claim.sub = '7e01ff2f-b906-46f4-8d52-2b5017195502';
do $$ begin
  begin
    perform public.get_followed_guide('7e01ff2f-b906-46f4-8d52-2b5017195501');
    raise exception 'test_failed_revoked_read';
  exception when raise_exception then
    if sqlerrm <> 'guide_access_denied' then raise; end if;
  end;
end $$;
reset role;
rollback;
select 'Approval, hidden places, self-approval protection and revocation passed. Fixtures rolled back.' as result;
