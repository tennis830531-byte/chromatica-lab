begin;

create extension if not exists pgcrypto with schema extensions;

create table public.weekly_leaderboard_scores (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_cycles bigint not null default 0 check (completed_cycles >= 0),
  score_reached_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (week_start, user_id)
);

create table public.weekly_leaderboard_results (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_rank integer not null check (final_rank > 0),
  completed_cycles bigint not null check (completed_cycles >= 0),
  score_reached_at timestamptz not null,
  finalized_at timestamptz not null default pg_catalog.now(),
  primary key (week_start, user_id),
  unique (week_start, final_rank)
);

create table public.leaderboard_weekly_rank_state (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_rank integer,
  current_rank integer not null check (current_rank > 0),
  was_top_ten boolean not null default false,
  is_top_ten boolean not null default false,
  transition_sequence integer not null default 0 check (transition_sequence >= 0),
  drop_notification_count integer not null default 0 check (drop_notification_count between 0 and 3),
  last_drop_notified_at timestamptz,
  changed_at timestamptz not null default pg_catalog.now(),
  primary key (week_start, user_id)
);

create table public.leaderboard_push_device_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform = 'android'),
  token text not null check (char_length(token) between 20 and 4096),
  token_hash text generated always as (encode(extensions.digest(token, 'sha256'), 'hex')) stored,
  is_active boolean not null default true,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_registered_at timestamptz not null default pg_catalog.now(),
  last_success_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (token_hash)
);

create table public.leaderboard_push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_results boolean not null default true,
  top_ten_changes boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.leaderboard_notification_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('weekly_top_ten_result', 'entered_top_ten', 'rank_improved', 'dropped_out_of_top_ten')),
  rank integer not null check (rank > 0),
  transition_sequence integer not null default 0 check (transition_sequence >= 0),
  event_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'retry', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  last_error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  unique (week_start, user_id, notification_type, transition_sequence)
);

create table public.leaderboard_notification_deliveries (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  transition_sequence integer not null default 0,
  queue_id uuid not null references public.leaderboard_notification_queue(id) on delete cascade,
  delivered_at timestamptz not null default pg_catalog.now(),
  primary key (week_start, user_id, notification_type, transition_sequence)
);

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz
);

create table public.announcements (
  id uuid primary key default extensions.gen_random_uuid(),
  large_topic text not null check (char_length(btrim(large_topic)) between 1 and 30),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  image_path text,
  image_version bigint not null default 0 check (image_version >= 0),
  published_at timestamptz not null,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index weekly_leaderboard_scores_rank_idx on public.weekly_leaderboard_scores (week_start, completed_cycles desc, score_reached_at asc, user_id asc);
create index weekly_leaderboard_results_user_idx on public.weekly_leaderboard_results (user_id, week_start desc);
create index leaderboard_rank_state_top_idx on public.leaderboard_weekly_rank_state (week_start, is_top_ten, current_rank);
create index leaderboard_push_tokens_user_active_idx on public.leaderboard_push_device_tokens (user_id, is_active);
create index leaderboard_notification_queue_pending_idx on public.leaderboard_notification_queue (status, next_attempt_at, created_at) where status in ('pending', 'retry');
create index announcements_published_idx on public.announcements (is_published, published_at desc);

alter table public.weekly_leaderboard_scores enable row level security;
alter table public.weekly_leaderboard_results enable row level security;
alter table public.leaderboard_weekly_rank_state enable row level security;
alter table public.leaderboard_push_device_tokens enable row level security;
alter table public.leaderboard_push_preferences enable row level security;
alter table public.leaderboard_notification_queue enable row level security;
alter table public.leaderboard_notification_deliveries enable row level security;
alter table public.app_admins enable row level security;
alter table public.announcements enable row level security;

create policy "authenticated read published announcements"
  on public.announcements for select to authenticated
  using (is_published = true and published_at <= pg_catalog.now());

revoke all on public.weekly_leaderboard_scores, public.weekly_leaderboard_results,
  public.leaderboard_weekly_rank_state, public.leaderboard_push_device_tokens, public.leaderboard_push_preferences,
  public.leaderboard_notification_queue, public.leaderboard_notification_deliveries,
  public.app_admins, public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
grant select, insert, update, delete on public.weekly_leaderboard_scores, public.weekly_leaderboard_results,
  public.leaderboard_weekly_rank_state, public.leaderboard_push_device_tokens, public.leaderboard_push_preferences,
  public.leaderboard_notification_queue, public.leaderboard_notification_deliveries,
  public.app_admins, public.announcements to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-images', 'announcement-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.taipei_leaderboard_week_start(p_timestamp timestamptz default pg_catalog.now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (pg_catalog.date_trunc('week', (p_timestamp at time zone 'Asia/Taipei') + interval '1 day') - interval '1 day')::date;
$$;

create or replace function public.get_weekly_leaderboard()
returns table (
  "position" bigint, public_key text, display_name text, custom_avatar_path text,
  avatar_version bigint, featured_spirit_species text, featured_spirit_name text,
  featured_spirit_stage smallint, score bigint, is_current_user boolean, week_start date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_week date := public.taipei_leaderboard_week_start(pg_catalog.now());
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.leaderboard_profiles lp where lp.user_id = auth.uid() and lp.is_active and lp.profile_completed and lp.consented_at is not null) then
    raise exception 'completed leaderboard profile required';
  end if;
  return query
  with ranked as (
    select pg_catalog.row_number() over (order by ws.completed_cycles desc, ws.score_reached_at asc, pg_catalog.md5(ws.user_id::text) asc) rank_position,
      ws.user_id, lp.display_name, lp.custom_avatar_path, lp.avatar_version, lp.featured_spirit_species,
      lp.featured_spirit_name, lp.featured_spirit_stage, ws.completed_cycles
    from public.weekly_leaderboard_scores ws
    join public.leaderboard_profiles lp on lp.user_id = ws.user_id
    where ws.week_start = v_week and ws.completed_cycles > 0 and lp.is_active and lp.profile_completed and lp.consented_at is not null
  ), selected as (
    select * from ranked where rank_position <= 15
    union all select * from ranked where user_id = auth.uid() and rank_position > 15
  )
  select selected.rank_position, pg_catalog.md5(selected.user_id::text), selected.display_name,
    selected.custom_avatar_path, selected.avatar_version, selected.featured_spirit_species,
    selected.featured_spirit_name, selected.featured_spirit_stage, selected.completed_cycles,
    selected.user_id = auth.uid(), v_week
  from selected order by selected.rank_position;
end;
$$;

create or replace function public.refresh_weekly_leaderboard_rank_state(p_week_start date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank record;
  v_old public.leaderboard_weekly_rank_state%rowtype;
  v_sequence integer;
  v_allow_drop boolean;
  v_movement_enabled boolean;
  v_notification_type text;
begin
  for v_rank in
    select ws.user_id, pg_catalog.row_number() over (order by ws.completed_cycles desc, ws.score_reached_at asc, pg_catalog.md5(ws.user_id::text) asc)::integer as current_rank
    from public.weekly_leaderboard_scores ws
    join public.leaderboard_profiles lp on lp.user_id = ws.user_id
    where ws.week_start = p_week_start and ws.completed_cycles > 0 and lp.is_active and lp.profile_completed and lp.consented_at is not null
  loop
    select * into v_old from public.leaderboard_weekly_rank_state rs where rs.week_start = p_week_start and rs.user_id = v_rank.user_id for update;
    select coalesce((select p.top_ten_changes from public.leaderboard_push_preferences p where p.user_id = v_rank.user_id), true)
      into v_movement_enabled;
    if v_old.user_id is null then
      insert into public.leaderboard_weekly_rank_state (week_start, user_id, previous_rank, current_rank, was_top_ten, is_top_ten, transition_sequence)
      values (p_week_start, v_rank.user_id, null, v_rank.current_rank, false, v_rank.current_rank <= 10, case when v_rank.current_rank <= 10 then 1 else 0 end);
      if v_movement_enabled and v_rank.current_rank <= 10 then
        insert into public.leaderboard_notification_queue (week_start, user_id, notification_type, rank, transition_sequence, event_key)
        values (p_week_start, v_rank.user_id, 'entered_top_ten', v_rank.current_rank, 1,
          p_week_start::text || ':' || v_rank.user_id::text || ':entered_top_ten:1')
        on conflict do nothing;
      end if;
      continue;
    end if;
    v_sequence := v_old.transition_sequence + case when v_old.current_rank is distinct from v_rank.current_rank then 1 else 0 end;
    v_allow_drop := v_old.is_top_ten and v_rank.current_rank > 10
      and v_old.drop_notification_count < 3
      and (v_old.last_drop_notified_at is null or v_old.last_drop_notified_at <= pg_catalog.now() - interval '30 minutes');
    update public.leaderboard_weekly_rank_state set
      previous_rank = v_old.current_rank,
      current_rank = v_rank.current_rank,
      was_top_ten = v_old.is_top_ten,
      is_top_ten = v_rank.current_rank <= 10,
      transition_sequence = v_sequence,
      drop_notification_count = drop_notification_count + case when v_allow_drop and v_movement_enabled then 1 else 0 end,
      last_drop_notified_at = case when v_allow_drop and v_movement_enabled then pg_catalog.now() else last_drop_notified_at end,
      changed_at = case when current_rank is distinct from v_rank.current_rank then pg_catalog.now() else changed_at end
    where week_start = p_week_start and user_id = v_rank.user_id;
    v_notification_type := case
      when v_allow_drop then 'dropped_out_of_top_ten'
      when not v_old.is_top_ten and v_rank.current_rank <= 10 then 'entered_top_ten'
      when v_old.is_top_ten and v_rank.current_rank <= 10 and v_rank.current_rank < v_old.current_rank then 'rank_improved'
      else null
    end;
    if v_movement_enabled and v_notification_type is not null then
      insert into public.leaderboard_notification_queue (week_start, user_id, notification_type, rank, transition_sequence, event_key)
      values (p_week_start, v_rank.user_id, v_notification_type, v_rank.current_rank, v_sequence,
        p_week_start::text || ':' || v_rank.user_id::text || ':' || v_notification_type || ':' || v_sequence::text)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.record_weekly_leaderboard_practice(
  p_event_id uuid, p_completed_cycles integer, p_practice_date date, p_protected_dates date[]
)
returns table (accepted boolean, previous_rank integer, current_rank integer, week_start date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_week date := public.taipei_leaderboard_week_start(pg_catalog.now());
  v_accepted boolean;
  v_previous_rank integer;
  v_current_rank integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('weekly-leaderboard:' || v_week::text));
  perform public.refresh_weekly_leaderboard_rank_state(v_week);
  select ranked.rank_position into v_previous_rank from (
    select ws.user_id, pg_catalog.row_number() over (order by ws.completed_cycles desc, ws.score_reached_at asc, pg_catalog.md5(ws.user_id::text) asc)::integer rank_position
    from public.weekly_leaderboard_scores ws where ws.week_start = v_week and ws.completed_cycles > 0
  ) ranked where ranked.user_id = v_user_id;
  v_accepted := public.record_leaderboard_practice(p_event_id, p_completed_cycles, p_practice_date, p_protected_dates);
  if v_accepted then
    insert into public.weekly_leaderboard_scores (week_start, user_id, completed_cycles, score_reached_at, updated_at)
    values (v_week, v_user_id, p_completed_cycles, pg_catalog.now(), pg_catalog.now())
    on conflict on constraint weekly_leaderboard_scores_pkey do update set completed_cycles = public.weekly_leaderboard_scores.completed_cycles + excluded.completed_cycles,
      score_reached_at = pg_catalog.now(), updated_at = pg_catalog.now();
    perform public.refresh_weekly_leaderboard_rank_state(v_week);
  end if;
  select ranked.rank_position into v_current_rank from (
    select ws.user_id, pg_catalog.row_number() over (order by ws.completed_cycles desc, ws.score_reached_at asc, pg_catalog.md5(ws.user_id::text) asc)::integer rank_position
    from public.weekly_leaderboard_scores ws where ws.week_start = v_week and ws.completed_cycles > 0
  ) ranked where ranked.user_id = v_user_id;
  return query select v_accepted, v_previous_rank, v_current_rank, v_week;
end;
$$;

create or replace function public.finalize_weekly_leaderboard(p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_week date := coalesce(p_week_start, public.taipei_leaderboard_week_start(pg_catalog.now()) - 7); v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('weekly-finalize:' || v_week::text));
  insert into public.weekly_leaderboard_results (week_start, user_id, final_rank, completed_cycles, score_reached_at)
  select v_week, ranked.user_id, ranked.rank_position, ranked.completed_cycles, ranked.score_reached_at from (
    select ws.user_id, ws.completed_cycles, ws.score_reached_at,
      pg_catalog.row_number() over (order by ws.completed_cycles desc, ws.score_reached_at asc, pg_catalog.md5(ws.user_id::text) asc)::integer rank_position
    from public.weekly_leaderboard_scores ws where ws.week_start = v_week and ws.completed_cycles > 0
  ) ranked on conflict (week_start, user_id) do nothing;
  get diagnostics v_count = row_count;
  insert into public.leaderboard_notification_queue (week_start, user_id, notification_type, rank, transition_sequence, event_key)
  select wr.week_start, wr.user_id, 'weekly_top_ten_result', wr.final_rank, 0,
    wr.week_start::text || ':' || wr.user_id::text || ':weekly_top_ten_result:0'
  from public.weekly_leaderboard_results wr
  where wr.week_start = v_week and wr.final_rank <= 10
    and coalesce((select p.weekly_results from public.leaderboard_push_preferences p where p.user_id = wr.user_id), true)
  on conflict do nothing;
  return v_count;
end;
$$;

create or replace function public.claim_leaderboard_notification_queue(p_limit integer default 20)
returns table (id uuid, week_start date, user_id uuid, notification_type text, rank integer, transition_sequence integer, attempts integer)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select q.id from public.leaderboard_notification_queue q
    where ((q.status in ('pending','retry') and q.next_attempt_at <= pg_catalog.now())
      or (q.status = 'processing' and q.processed_at <= pg_catalog.now() - interval '10 minutes'))
      and q.attempts < 5
    order by q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,20),100))
  )
  update public.leaderboard_notification_queue q set status='processing', attempts=q.attempts+1, processed_at=pg_catalog.now()
  from candidates c where q.id=c.id
  returning q.id,q.week_start,q.user_id,q.notification_type,q.rank,q.transition_sequence,q.attempts;
$$;

create or replace function public.dispatch_leaderboard_notification_queue()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_url text;
  v_cron_secret text;
begin
  select ds.decrypted_secret into v_function_url
  from vault.decrypted_secrets ds
  where ds.name = 'leaderboard_notification_function_url'
  order by ds.created_at desc limit 1;
  select ds.decrypted_secret into v_cron_secret
  from vault.decrypted_secrets ds
  where ds.name = 'leaderboard_notification_cron_secret'
  order by ds.created_at desc limit 1;
  if nullif(btrim(v_function_url), '') is null or nullif(btrim(v_cron_secret), '') is null then
    return false;
  end if;
  perform net.http_post(
    url := v_function_url,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.register_leaderboard_push_token(p_token text, p_platform text, p_enabled boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_token text := btrim(coalesce(p_token, ''));
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_platform <> 'android' or char_length(v_token) < 20 or char_length(v_token) > 4096 then raise exception 'invalid push token'; end if;
  insert into public.leaderboard_push_device_tokens (user_id, platform, token, is_active, failure_count, disabled_at, last_registered_at, updated_at)
  values (v_user_id, 'android', v_token, coalesce(p_enabled, true), 0, case when p_enabled then null else pg_catalog.now() end, pg_catalog.now(), pg_catalog.now())
  on conflict (token_hash) do update set user_id = excluded.user_id, platform = excluded.platform, token = excluded.token,
    is_active = excluded.is_active, failure_count = 0, disabled_at = excluded.disabled_at,
    last_registered_at = pg_catalog.now(), updated_at = pg_catalog.now();
  return true;
end;
$$;

create or replace function public.disable_leaderboard_push_token()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.leaderboard_push_device_tokens set is_active = false, disabled_at = pg_catalog.now(), updated_at = pg_catalog.now() where user_id = auth.uid() and is_active;
  return true;
end;
$$;

create or replace function public.get_leaderboard_push_preferences()
returns table (weekly_results boolean, top_ten_changes boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.weekly_results, true), coalesce(p.top_ten_changes, true)
  from (select auth.uid() as user_id) u
  left join public.leaderboard_push_preferences p on p.user_id = u.user_id
  where u.user_id is not null;
$$;

create or replace function public.set_leaderboard_push_preferences(p_weekly_results boolean, p_top_ten_changes boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  insert into public.leaderboard_push_preferences (user_id, weekly_results, top_ten_changes, updated_at)
  values (v_user_id, coalesce(p_weekly_results, true), coalesce(p_top_ten_changes, true), pg_catalog.now())
  on conflict (user_id) do update set weekly_results = excluded.weekly_results,
    top_ten_changes = excluded.top_ten_changes, updated_at = pg_catalog.now();
  return true;
end;
$$;

create or replace function public.get_published_announcements()
returns table (id uuid, large_topic text, title text, body text, image_path text, image_version bigint, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.large_topic, a.title, a.body, a.image_path, a.image_version, a.published_at
  from public.announcements a where a.is_published and a.published_at <= pg_catalog.now()
  order by a.published_at desc, a.id desc limit 100;
$$;

create or replace function public.is_app_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.app_admins aa where aa.user_id = p_user_id and aa.revoked_at is null); $$;

create or replace function public.get_announcement_admin_status()
returns table (is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$ select public.is_app_admin(auth.uid()); $$;

create or replace function public.get_admin_announcements()
returns setof public.announcements
language plpgsql
stable
security definer
set search_path = ''
as $$ begin if not public.is_app_admin(auth.uid()) then raise exception 'admin required'; end if; return query select * from public.announcements order by updated_at desc; end; $$;

create or replace function public.save_announcement(p_id uuid, p_large_topic text, p_title text, p_body text, p_published_at timestamptz, p_publish boolean default false)
returns public.announcements
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_result public.announcements;
begin
  if not public.is_app_admin(v_user_id) then raise exception 'admin required'; end if;
  if char_length(btrim(coalesce(p_large_topic,''))) not between 1 and 30 or char_length(btrim(coalesce(p_title,''))) not between 1 and 80 or char_length(coalesce(p_body,'')) not between 1 and 5000 or p_published_at is null then raise exception 'invalid announcement'; end if;
  if p_id is null then
    insert into public.announcements (large_topic,title,body,published_at,is_published,created_by,updated_by)
    values (btrim(p_large_topic),btrim(p_title),p_body,p_published_at,coalesce(p_publish,false),v_user_id,v_user_id) returning * into v_result;
  else
    update public.announcements set large_topic=btrim(p_large_topic),title=btrim(p_title),body=p_body,published_at=p_published_at,
      is_published=coalesce(p_publish,false),updated_by=v_user_id,updated_at=pg_catalog.now() where id=p_id returning * into v_result;
    if not found then raise exception 'announcement not found'; end if;
  end if;
  return v_result;
end;
$$;

create or replace function public.set_announcement_published(p_id uuid, p_publish boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$ begin if not public.is_app_admin(auth.uid()) then raise exception 'admin required'; end if; update public.announcements set is_published=coalesce(p_publish,false),updated_by=auth.uid(),updated_at=pg_catalog.now() where id=p_id; return found; end; $$;

create or replace function public.reset_my_leaderboard_data()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  delete from public.leaderboard_notification_deliveries where user_id = v_user_id;
  delete from public.leaderboard_notification_queue where user_id = v_user_id;
  delete from public.leaderboard_weekly_rank_state where user_id = v_user_id;
  delete from public.weekly_leaderboard_results where user_id = v_user_id;
  delete from public.weekly_leaderboard_scores where user_id = v_user_id;
  delete from public.leaderboard_practice_days where user_id = v_user_id;
  delete from public.leaderboard_practice_events where user_id = v_user_id;
  delete from public.leaderboard_push_preferences where user_id = v_user_id;
  delete from public.leaderboard_profiles where user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.taipei_leaderboard_week_start(timestamptz), public.get_weekly_leaderboard(),
  public.refresh_weekly_leaderboard_rank_state(date), public.record_weekly_leaderboard_practice(uuid,integer,date,date[]),
  public.finalize_weekly_leaderboard(date), public.claim_leaderboard_notification_queue(integer), public.dispatch_leaderboard_notification_queue(), public.register_leaderboard_push_token(text,text,boolean),
  public.disable_leaderboard_push_token(), public.get_leaderboard_push_preferences(), public.set_leaderboard_push_preferences(boolean,boolean),
  public.get_published_announcements(), public.is_app_admin(uuid),
  public.get_announcement_admin_status(), public.get_admin_announcements(),
  public.save_announcement(uuid,text,text,text,timestamptz,boolean), public.set_announcement_published(uuid,boolean),
  public.reset_my_leaderboard_data()
from public, anon;

grant execute on function public.get_weekly_leaderboard(), public.record_weekly_leaderboard_practice(uuid,integer,date,date[]),
  public.register_leaderboard_push_token(text,text,boolean), public.disable_leaderboard_push_token(),
  public.get_leaderboard_push_preferences(), public.set_leaderboard_push_preferences(boolean,boolean),
  public.get_published_announcements(), public.get_announcement_admin_status(), public.get_admin_announcements(),
  public.save_announcement(uuid,text,text,text,timestamptz,boolean), public.set_announcement_published(uuid,boolean),
  public.reset_my_leaderboard_data()
to authenticated;
grant execute on function public.taipei_leaderboard_week_start(timestamptz), public.refresh_weekly_leaderboard_rank_state(date),
  public.finalize_weekly_leaderboard(date), public.claim_leaderboard_notification_queue(integer), public.dispatch_leaderboard_notification_queue() to service_role;

do $scheduler$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    begin
      execute $sql$select cron.schedule('chromatica-finalize-weekly-leaderboard', '0 16 * * 6', 'select public.finalize_weekly_leaderboard();')$sql$;
      execute $sql$select cron.schedule('chromatica-dispatch-leaderboard-notifications', '* * * * *', 'select public.dispatch_leaderboard_notification_queue();')$sql$;
    exception when others then
      raise notice 'Weekly finalization cron must be configured during deployment: %', sqlerrm;
    end;
  end if;
end;
$scheduler$;

commit;
