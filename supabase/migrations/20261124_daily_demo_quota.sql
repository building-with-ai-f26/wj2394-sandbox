create extension if not exists pgcrypto with schema extensions;

create schema if not exists inner_table_private;
revoke all on schema inner_table_private from public, anon, authenticated;

create table inner_table_private.demo_daily_totals (
  day date primary key,
  visitor_requests integer not null default 0,
  owner_requests bigint not null default 0
);

create table inner_table_private.demo_daily_visitors (
  day date not null references inner_table_private.demo_daily_totals(day) on delete cascade,
  fingerprint bytea not null,
  requests integer not null default 0,
  primary key (day, fingerprint)
);

create function inner_table_private.demo_retry_after(at_time timestamptz)
returns integer
language sql stable
set search_path = ''
as $$
  select greatest(1, ceil(extract(epoch from
    ((((at_time at time zone 'America/New_York')::date + 1)::timestamp
      at time zone 'America/New_York') - at_time)))::integer);
$$;

create function public.consume_demo_request(
  p_timestamp bigint,
  p_visitor text,
  p_kind text,
  p_signature text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := clock_timestamp();
  day_key date;
  signing_key text;
  expected_signature text;
  visitor_key bytea;
  total_used integer;
  visitor_used integer;
begin
  if p_timestamp is null
      or p_timestamp not between extract(epoch from checked_at)::bigint - 60
                             and extract(epoch from checked_at)::bigint + 60
      or p_kind is null or p_kind not in ('owner', 'priority', 'general')
      or p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$'
      or p_signature is null or p_signature !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'demo_quota_denied';
  end if;
  select decrypted_secret into signing_key
    from vault.decrypted_secrets
    where name = 'inner_table_demo_quota';
  if signing_key is null then
    raise exception using errcode = '42501', message = 'demo_quota_denied';
  end if;
  expected_signature := encode(extensions.hmac(
    'count:' || p_timestamp::text || ':' || p_visitor || ':' || p_kind,
    signing_key, 'sha256'), 'hex');
  if extensions.hmac(p_signature, signing_key, 'sha256') <>
      extensions.hmac(expected_signature, signing_key, 'sha256') then
    raise exception using errcode = '42501', message = 'demo_quota_denied';
  end if;

  day_key := (checked_at at time zone 'America/New_York')::date;
  insert into inner_table_private.demo_daily_totals(day)
    values (day_key) on conflict (day) do nothing;
  if found then
    delete from inner_table_private.demo_daily_totals where day < day_key - 7;
  end if;

  if p_kind = 'owner' then
    update inner_table_private.demo_daily_totals
      set owner_requests = owner_requests + 1 where day = day_key;
    return 0;
  end if;

  -- Lock the shared count first so the per-IP check and both writes are atomic.
  select visitor_requests into total_used
    from inner_table_private.demo_daily_totals where day = day_key for update;
  visitor_key := extensions.hmac(day_key::text || ':' || p_visitor, signing_key, 'sha256');
  select requests into visitor_used from inner_table_private.demo_daily_visitors
    where day = day_key and fingerprint = visitor_key;
  if total_used >= (case p_kind when 'priority' then 300 else 270 end)
      or coalesce(visitor_used, 0) >= (case p_kind when 'priority' then 60 else 50 end) then
    return inner_table_private.demo_retry_after(checked_at);
  end if;

  update inner_table_private.demo_daily_totals
    set visitor_requests = visitor_requests + 1 where day = day_key;
  insert into inner_table_private.demo_daily_visitors as usage (day, fingerprint, requests)
    values (day_key, visitor_key, 1)
    on conflict (day, fingerprint) do update set requests = usage.requests + 1;
  return 0;
end;
$$;

revoke execute on function public.consume_demo_request(bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_demo_request(bigint, text, text, text) to anon;
