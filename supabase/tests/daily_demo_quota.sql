-- Run in an isolated database. The harness must expose Supabase Vault or a local fixture.
begin;

select vault.create_secret(repeat('a', 64), 'inner_table_demo_quota');

create function pg_temp.consume_with_test_signature(visitor_number integer, kind text)
returns integer
language plpgsql
as $$
declare
  fingerprint text := lpad(to_hex(visitor_number), 64, '0');
  stamp bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  signature text := encode(extensions.hmac(
    'count:' || stamp::text || ':' || fingerprint || ':' || kind, repeat('a', 64), 'sha256'), 'hex');
begin
  return public.consume_demo_request(stamp, fingerprint, kind, signature);
end;
$$;

do $$
declare
  day_key date := (clock_timestamp() at time zone 'America/New_York')::date;
  i integer;
begin
  if has_schema_privilege('anon', 'inner_table_private', 'usage')
      or has_schema_privilege('authenticated', 'inner_table_private', 'usage') then
    raise exception 'usage tables are directly visible to app roles';
  end if;
  begin
    perform public.consume_demo_request(floor(extract(epoch from clock_timestamp()))::bigint,
      repeat('1', 64), 'owner', repeat('0', 64));
    raise exception 'unsigned owner bypass was accepted';
  exception when insufficient_privilege then null;
  end;

  insert into inner_table_private.demo_daily_totals(day, visitor_requests)
    values (day_key - 1, 300);
  for i in 1..50 loop
    if pg_temp.consume_with_test_signature(1, 'general') <> 0 then
      raise exception 'general quota denied admission too early';
    end if;
  end loop;
  if pg_temp.consume_with_test_signature(1, 'general') <= 0 then
    raise exception 'general traffic used the visitor reserve';
  end if;
  for i in 1..10 loop
    if pg_temp.consume_with_test_signature(1, 'priority') <> 0 then
      raise exception 'priority traffic did not receive the visitor reserve';
    end if;
  end loop;
  if pg_temp.consume_with_test_signature(1, 'priority') <= 0 then
    raise exception 'visitor quota exceeded 60';
  end if;
  for i in 61..270 loop
    if pg_temp.consume_with_test_signature(i, 'general') <> 0 then
      raise exception 'general quota denied admission before the demo reserve';
    end if;
  end loop;
  if pg_temp.consume_with_test_signature(271, 'general') <= 0 then
    raise exception 'general traffic used the demo reserve';
  end if;
  for i in 271..300 loop
    if pg_temp.consume_with_test_signature(i, 'priority') <> 0 then
      raise exception 'priority traffic did not receive the demo reserve';
    end if;
  end loop;
  if pg_temp.consume_with_test_signature(301, 'priority') <= 0 then
    raise exception 'demo quota exceeded 300';
  end if;
  for i in 1..2 loop
    if pg_temp.consume_with_test_signature(1, 'owner') <> 0 then
      raise exception 'owner traffic was refused';
    end if;
  end loop;
  if not exists (
    select 1 from inner_table_private.demo_daily_totals
    where day = day_key and visitor_requests = 300 and owner_requests = 2
  ) then
    raise exception 'owner traffic depleted the visitor budget';
  end if;

  if inner_table_private.demo_retry_after('2026-03-08 05:00:00+00') <> 82800
      or inner_table_private.demo_retry_after('2026-11-01 04:00:00+00') <> 90000
      or inner_table_private.demo_retry_after('2026-11-02 04:59:59+00') <> 1 then
    raise exception 'New York midnight reset mishandled a daylight-saving boundary';
  end if;
end;
$$;

rollback;
