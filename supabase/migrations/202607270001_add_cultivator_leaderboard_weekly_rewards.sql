begin;

-- game_saves predates the checked-in leaderboard migrations. Keeping this exact
-- fallback makes local resets self-contained; production already has this table,
-- so CREATE TABLE IF NOT EXISTS is a no-op there.
create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  revision bigint not null default 1 check (revision >= 1),
  snapshot jsonb not null check (pg_catalog.jsonb_typeof(snapshot) = 'object'),
  client_updated_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.game_saves enable row level security;
grant select, insert, update, delete on public.game_saves to service_role;

create table if not exists public.leaderboard_spirit_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  species text not null check (species in ('melody-sprout', 'mushroom-spirit', 'flower-spirit')),
  stage smallint not null check (stage between 1 and 3),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, species)
);

create table if not exists public.leaderboard_weekly_water_rewards (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_rank integer not null check (final_rank between 1 and 10),
  water_amount integer not null check (water_amount between 2 and 20),
  granted_at timestamptz not null default pg_catalog.now(),
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
  applied_at timestamptz,
  applied_revision bigint,
  notice_claim_token uuid,
  notice_claimed_at timestamptz,
  notice_seen_at timestamptz,
  primary key (week_start, user_id)
);

create table if not exists public.leaderboard_weekly_reward_settings (
  singleton boolean primary key default true check (singleton),
  eligible_week_start date not null,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.leaderboard_spirit_progress enable row level security;
alter table public.leaderboard_weekly_water_rewards enable row level security;
alter table public.leaderboard_weekly_reward_settings enable row level security;

revoke all on public.leaderboard_spirit_progress,
  public.leaderboard_weekly_water_rewards,
  public.leaderboard_weekly_reward_settings
from public, anon, authenticated;

grant select, insert, update, delete on public.leaderboard_spirit_progress,
  public.leaderboard_weekly_water_rewards,
  public.leaderboard_weekly_reward_settings
to service_role;

create index if not exists leaderboard_spirit_progress_ranking_idx
  on public.leaderboard_spirit_progress (user_id, stage desc);

create index if not exists leaderboard_weekly_water_rewards_unclaimed_idx
  on public.leaderboard_weekly_water_rewards (user_id, status, notice_seen_at, week_start)
  where notice_seen_at is null and status <> 'cancelled';

create or replace function public.taipei_leaderboard_week_start(
  p_timestamp timestamptz default pg_catalog.now()
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    pg_catalog.date_trunc(
      'week',
      ((p_timestamp at time zone 'Asia/Taipei') - interval '12 hours') + interval '1 day'
    ) - interval '1 day'
  )::date;
$$;

insert into public.leaderboard_weekly_reward_settings (singleton, eligible_week_start)
values (true, public.taipei_leaderboard_week_start(pg_catalog.now()))
on conflict (singleton) do nothing;

create or replace function public.sync_spirit_cultivator_progress(p_spirits jsonb)
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
  if not exists (
    select 1
    from public.leaderboard_profiles lp
    where lp.user_id = v_user_id
      and lp.is_active
      and lp.profile_completed
      and lp.consented_at is not null
  ) then
    raise exception 'completed leaderboard profile required';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_spirits, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_spirits, '[]'::jsonb)) > 3 then
    raise exception 'invalid spirit progress';
  end if;

  insert into public.leaderboard_spirit_progress (user_id, species, stage, updated_at)
  select
    v_user_id,
    source.species,
    pg_catalog.max(source.stage)::smallint,
    pg_catalog.now()
  from (
    select
      item->>'species' as species,
      greatest(1, least(3, (item->>'stage')::integer)) as stage
    from pg_catalog.jsonb_array_elements(coalesce(p_spirits, '[]'::jsonb)) item
    where item->>'species' in ('melody-sprout', 'mushroom-spirit', 'flower-spirit')
      and coalesce(item->>'stage', '') ~ '^[1-3]$'
  ) source
  group by source.species
  on conflict (user_id, species) do update
    set stage = greatest(public.leaderboard_spirit_progress.stage, excluded.stage),
        updated_at = pg_catalog.now();
  return true;
end;
$$;

create or replace function public.get_spirit_cultivator_leaderboard()
returns table (
  "position" bigint,
  public_key text,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint,
  featured_spirit_species text,
  featured_spirit_name text,
  featured_spirit_stage smallint,
  score bigint,
  secondary_score bigint,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.leaderboard_profiles lp
    where lp.user_id = auth.uid()
      and lp.is_active and lp.profile_completed and lp.consented_at is not null
  ) then
    raise exception 'completed leaderboard profile required';
  end if;

  return query
  with progress as (
    select lsp.user_id, pg_catalog.count(*)::bigint species_count,
      coalesce(pg_catalog.sum(lsp.stage), 0)::bigint stage_total
    from public.leaderboard_spirit_progress lsp
    group by lsp.user_id
  ), ranked as (
    select
      pg_catalog.row_number() over (
        order by coalesce(progress.species_count, 0) desc,
          coalesce(progress.stage_total, 0) desc,
          lp.joined_at asc,
          lp.user_id asc
      ) as rank_position,
      lp.user_id, lp.display_name, lp.custom_avatar_path, lp.avatar_version,
      lp.featured_spirit_species, lp.featured_spirit_name, lp.featured_spirit_stage,
      coalesce(progress.species_count, 0)::bigint species_count,
      coalesce(progress.stage_total, 0)::bigint stage_total
    from public.leaderboard_profiles lp
    left join progress on progress.user_id = lp.user_id
    where lp.is_active and lp.profile_completed and lp.consented_at is not null
  ), current_member as (
    select ranked.rank_position from ranked where ranked.user_id = auth.uid()
  ), selected as (
    select ranked.*
    from ranked
    cross join current_member
    where ranked.rank_position <= 15
       or ranked.rank_position between greatest(1::bigint, current_member.rank_position - 5)
         and current_member.rank_position + 5
  )
  select selected.rank_position, pg_catalog.md5(selected.user_id::text),
    selected.display_name, selected.custom_avatar_path, selected.avatar_version,
    selected.featured_spirit_species, selected.featured_spirit_name,
    selected.featured_spirit_stage, selected.species_count, selected.stage_total,
    selected.user_id = auth.uid()
  from selected
  order by selected.rank_position;
end;
$$;

create or replace function public.finalize_weekly_leaderboard(p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := coalesce(p_week_start, public.taipei_leaderboard_week_start(pg_catalog.now()) - 7);
  v_count integer;
  v_eligible_week date;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('weekly-finalize:' || v_week::text));

  insert into public.weekly_leaderboard_results
    (week_start, user_id, final_rank, completed_cycles, score_reached_at)
  select v_week, ranked.user_id, ranked.rank_position, ranked.completed_cycles, ranked.score_reached_at
  from (
    select lp.user_id, coalesce(ws.completed_cycles, 0::bigint) completed_cycles,
      coalesce(ws.score_reached_at, lp.joined_at) score_reached_at,
      pg_catalog.row_number() over (
        order by coalesce(ws.completed_cycles, 0::bigint) desc,
          lp.joined_at asc, lp.user_id asc
      )::integer rank_position
    from public.leaderboard_profiles lp
    left join public.weekly_leaderboard_scores ws
      on ws.user_id = lp.user_id and ws.week_start = v_week
    where lp.is_active and lp.profile_completed and lp.consented_at is not null
  ) ranked
  on conflict (week_start, user_id) do nothing;
  get diagnostics v_count = row_count;

  select settings.eligible_week_start into v_eligible_week
  from public.leaderboard_weekly_reward_settings settings
  where settings.singleton;

  if v_week >= v_eligible_week then
    insert into public.leaderboard_weekly_water_rewards
      (week_start, user_id, final_rank, water_amount)
    select results.week_start, results.user_id, results.final_rank,
      22 - (results.final_rank * 2)
    from public.weekly_leaderboard_results results
    where results.week_start = v_week and results.final_rank between 1 and 10
    on conflict (week_start, user_id) do nothing;
  end if;

  insert into public.leaderboard_notification_queue
    (week_start, user_id, notification_type, rank, transition_sequence, event_key)
  select results.week_start, results.user_id, 'weekly_top_ten_result',
    results.final_rank, 0,
    results.week_start::text || ':' || results.user_id::text || ':weekly_top_ten_result:0'
  from public.weekly_leaderboard_results results
  where results.week_start = v_week and results.final_rank <= 10
    and coalesce((
      select preferences.weekly_results
      from public.leaderboard_push_preferences preferences
      where preferences.user_id = results.user_id
    ), true)
  on conflict do nothing;
  return v_count;
end;
$$;

create or replace function public.claim_my_weekly_water_reward(
  p_notice_claim_token uuid default gen_random_uuid()
)
returns table (
  week_start date,
  final_rank integer,
  water_amount integer,
  applied_revision bigint,
  notice_claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reward public.leaderboard_weekly_water_rewards%rowtype;
  v_save public.game_saves%rowtype;
  v_water bigint;
  v_next_revision bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_notice_claim_token is null then
    raise exception 'notice claim token required';
  end if;

  select reward.* into v_reward
  from public.leaderboard_weekly_water_rewards reward
  where reward.user_id = v_user_id
    and reward.status <> 'cancelled'
    and reward.notice_seen_at is null
    and (
      reward.notice_claim_token is null
      or reward.notice_claim_token = p_notice_claim_token
      or reward.notice_claimed_at < pg_catalog.now() - interval '30 seconds'
    )
  order by reward.week_start
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  if v_reward.status = 'pending' then
    select save.* into v_save
    from public.game_saves save
    where save.user_id = v_user_id
    for update;

    if not found then
      raise exception 'cloud game save required before applying weekly reward';
    end if;

    if pg_catalog.jsonb_typeof(v_save.snapshot->'data') <> 'object' then
      raise exception 'cloud game save data is invalid';
    end if;

    v_water := case
      when coalesce(v_save.snapshot #>> '{data,chromatica.waterDrops}', '') ~ '^[0-9]+$'
        then (v_save.snapshot #>> '{data,chromatica.waterDrops}')::bigint
      else 0
    end;
    if v_water > 2147483647 - v_reward.water_amount then
      raise exception 'water balance exceeds supported range';
    end if;

    v_next_revision := v_save.revision + 1;
    update public.game_saves save
    set snapshot = pg_catalog.jsonb_set(
          save.snapshot,
          '{data,chromatica.waterDrops}',
          pg_catalog.to_jsonb((v_water + v_reward.water_amount)::text),
          true
        ),
        revision = v_next_revision,
        updated_at = pg_catalog.now()
    where save.user_id = v_user_id;

    update public.leaderboard_weekly_water_rewards reward
    set status = 'applied',
        applied_at = pg_catalog.now(),
        applied_revision = v_next_revision
    where reward.week_start = v_reward.week_start
      and reward.user_id = v_user_id;

    v_reward.status := 'applied';
    v_reward.applied_revision := v_next_revision;
  end if;

  update public.leaderboard_weekly_water_rewards reward
  set notice_claim_token = p_notice_claim_token,
      notice_claimed_at = pg_catalog.now()
  where reward.week_start = v_reward.week_start
    and reward.user_id = v_user_id;

  return query select
    v_reward.week_start,
    v_reward.final_rank,
    v_reward.water_amount,
    v_reward.applied_revision,
    p_notice_claim_token;
end;
$$;

create or replace function public.ack_my_weekly_water_reward_notice(
  p_week_start date,
  p_notice_claim_token uuid
)
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
  update public.leaderboard_weekly_water_rewards reward
  set notice_seen_at = coalesce(reward.notice_seen_at, pg_catalog.now())
  where reward.week_start = p_week_start
    and reward.user_id = v_user_id
    and reward.status = 'applied'
    and reward.notice_seen_at is null
    and reward.notice_claim_token = p_notice_claim_token;
  return found;
end;
$$;

create or replace function public.reset_my_leaderboard_data()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  update public.leaderboard_weekly_water_rewards
  set status = case when status = 'pending' then 'cancelled' else status end,
      notice_seen_at = coalesce(notice_seen_at, pg_catalog.now())
  where user_id = v_user_id;
  delete from public.leaderboard_spirit_progress where user_id = v_user_id;
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

revoke all on function public.sync_spirit_cultivator_progress(jsonb),
  public.get_spirit_cultivator_leaderboard(),
  public.claim_my_weekly_water_reward(uuid),
  public.ack_my_weekly_water_reward_notice(date, uuid)
from public, anon;

grant execute on function public.sync_spirit_cultivator_progress(jsonb),
  public.get_spirit_cultivator_leaderboard(),
  public.claim_my_weekly_water_reward(uuid),
  public.ack_my_weekly_water_reward_notice(date, uuid)
to authenticated;

do $scheduler$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(job.jobid)
      from cron.job job
      where job.jobname = 'chromatica-finalize-weekly-leaderboard';
      perform cron.schedule(
        'chromatica-finalize-weekly-leaderboard',
        '0 4 * * 0',
        'select public.finalize_weekly_leaderboard();'
      );
    exception when others then
      raise notice 'Weekly finalization cron must be changed to Sunday 12:00 Asia/Taipei during deployment: %', sqlerrm;
    end;
  end if;
end;
$scheduler$;

commit;
