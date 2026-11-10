-- Run after the migration. Every fixture is rolled back.
begin;
insert into auth.users (id, email) values
  ('ea80f840-6800-4727-8365-28d6e61c7211', 'inner-table-fixture-a@example.com'),
  ('ea80f840-6800-4727-8365-28d6e61c7212', 'inner-table-fixture-b@example.com');
set local role authenticated;
set local request.jwt.claim.sub = 'ea80f840-6800-4727-8365-28d6e61c7211';
insert into public.profiles (id, display_name, username)
values (auth.uid(), 'Fictional account A', 'fixture_account_a');
select public.save_my_guide('[{"id":"fixture","name":"Fictional cafe"}]'::jsonb, 0);
do $$ begin
  begin
    perform public.save_my_guide('[]'::jsonb, 0);
    raise exception 'test_failed_stale_revision';
  exception when raise_exception then
    if sqlerrm <> 'guide_conflict' then raise; end if;
  end;
end $$;
set local request.jwt.claim.sub = 'ea80f840-6800-4727-8365-28d6e61c7212';
do $$ begin
  if exists (select 1 from public.private_guides) or exists (select 1 from public.profiles) then
    raise exception 'test_failed_cross_account_read';
  end if;
  update public.private_guides set places = '[]'::jsonb
  where owner_id = 'ea80f840-6800-4727-8365-28d6e61c7211';
  if found then raise exception 'test_failed_cross_account_write'; end if;
  begin
    insert into public.profiles (id, display_name)
    values ('ea80f840-6800-4727-8365-28d6e61c7211', 'Forbidden');
    raise exception 'test_failed_owner_spoof';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'Private ownership and revision checks passed. Fixtures rolled back.' as result;
