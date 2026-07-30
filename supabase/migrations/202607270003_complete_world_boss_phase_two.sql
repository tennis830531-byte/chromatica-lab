begin;

-- Phase 2 is forward-only. Phase 1 combat, energy, and skill rules remain intact.
alter table public.world_boss_definitions
  add column rotation_order integer not null default 1,
  add column success_participation_water integer not null default 5 check (success_participation_water >= 0),
  add column failure_participation_water integer not null default 5 check (failure_participation_water >= 0),
  add column success_first_hit_water integer not null default 30 check (success_first_hit_water >= 0),
  add column failure_first_hit_water integer not null default 15 check (failure_first_hit_water >= 0),
  add column success_last_hit_water integer not null default 30 check (success_last_hit_water >= 0),
  add column success_boss_defeated_water integer not null default 10 check (success_boss_defeated_water >= 0),
  add column success_damage_rank_water jsonb not null
    default '[100,80,60]'::jsonb
    check (pg_catalog.jsonb_typeof(success_damage_rank_water) = 'array'),
  add column failure_damage_rank_water jsonb not null
    default '[50,40,30]'::jsonb
    check (pg_catalog.jsonb_typeof(failure_damage_rank_water) = 'array');

alter table public.world_boss_energy_grants
  add column consumed_quantity integer not null default 0
    check (consumed_quantity between 0 and quantity);

alter table public.world_boss_settlement_snapshots
  add column total_attack_count bigint not null default 0,
  add column average_attack_count numeric(12,2) not null default 0,
  add column boss_alive_seconds bigint not null default 0,
  add column total_water_spent bigint not null default 0,
  add column event_start_energy_used bigint not null default 0,
  add column practice_energy_used bigint not null default 0,
  add column exchanged_energy_used bigint not null default 0,
  add column friday_damage bigint not null default 0,
  add column saturday_damage bigint not null default 0,
  add column sunday_damage bigint not null default 0,
  add column normal_attack_count bigint not null default 0,
  add column special_attack_count bigint not null default 0,
  add column total_reward_water bigint not null default 0;

create table public.world_boss_reward_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.world_boss_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null check (reward_type in (
    'participation', 'first_hit', 'rank_1', 'rank_2', 'rank_3',
    'last_hit', 'boss_defeated'
  )),
  water_amount integer not null check (water_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
  applied_revision bigint,
  applied_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (event_id, user_id, reward_type)
);

create table public.world_boss_notification_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.world_boss_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'boss_appeared', 'below_50', 'below_10', 'boss_defeated',
    'special_attack', 'first_hit', 'final_hit'
  )),
  in_app boolean not null default true,
  push boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'retry', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  read_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default pg_catalog.now()
);

create index world_boss_reward_items_pending_idx
  on public.world_boss_reward_items (event_id, status, user_id);
create index world_boss_notification_queue_claim_idx
  on public.world_boss_notification_queue (status, next_attempt_at, created_at)
  where push and status in ('pending', 'retry');
create index world_boss_notification_queue_in_app_idx
  on public.world_boss_notification_queue (user_id, read_at, created_at desc)
  where in_app;

alter table public.world_boss_reward_items enable row level security;
alter table public.world_boss_notification_queue enable row level security;
revoke all on public.world_boss_reward_items, public.world_boss_notification_queue
from public, anon, authenticated;
grant select, insert, update, delete on public.world_boss_reward_items,
  public.world_boss_notification_queue to service_role;

create function public.enqueue_world_boss_notification(
  p_event_id uuid,
  p_notification_type text,
  p_payload jsonb default '{}'::jsonb,
  p_push boolean default false,
  p_key_suffix text default ''
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_inserted integer;
begin
  insert into public.world_boss_notification_queue (
    event_id, user_id, notification_type, in_app, push, payload, idempotency_key
  )
  select p_event_id, profile.user_id, p_notification_type, true, p_push,
    coalesce(p_payload, '{}'::jsonb),
    pg_catalog.concat('world-boss:', p_event_id, ':', p_notification_type, ':',
      profile.user_id, ':', coalesce(p_key_suffix, ''))
  from public.leaderboard_profiles profile
  where profile.is_active and profile.profile_completed
    and profile.consented_at is not null
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create function public.track_world_boss_attack_phase_two()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.world_boss_events%rowtype;
  v_previous_hp integer;
  v_grant_id uuid;
begin
  select event.* into strict v_event
  from public.world_boss_events event where event.id = new.event_id;
  v_previous_hp := v_event.remaining_hp + new.effective_damage;

  if new.attack_type = 'special' then
    select grant_row.id into v_grant_id
    from public.world_boss_energy_grants grant_row
    where grant_row.event_id = new.event_id and grant_row.user_id = new.user_id
      and grant_row.consumed_quantity < grant_row.quantity
    order by case grant_row.source when 'event_start' then 1 when 'practice' then 2 else 3 end,
      grant_row.created_at, grant_row.id
    limit 1 for update;
    if v_grant_id is not null then
      update public.world_boss_energy_grants grant_row
      set consumed_quantity = grant_row.consumed_quantity + 1
      where grant_row.id = v_grant_id;
    end if;
    perform public.enqueue_world_boss_notification(
      new.event_id, 'special_attack',
      pg_catalog.jsonb_build_object('actor_user_id', new.user_id, 'damage', new.effective_damage),
      false, new.id::text
    );
  end if;
  if new.is_first_hit then
    perform public.enqueue_world_boss_notification(
      new.event_id, 'first_hit',
      pg_catalog.jsonb_build_object('actor_user_id', new.user_id),
      true, 'first'
    );
  end if;
  if v_previous_hp * 2 > v_event.max_hp and v_event.remaining_hp * 2 <= v_event.max_hp then
    perform public.enqueue_world_boss_notification(
      new.event_id, 'below_50',
      pg_catalog.jsonb_build_object('remaining_hp', v_event.remaining_hp),
      false, 'threshold'
    );
  end if;
  if v_previous_hp * 10 > v_event.max_hp and v_event.remaining_hp * 10 <= v_event.max_hp then
    perform public.enqueue_world_boss_notification(
      new.event_id, 'below_10',
      pg_catalog.jsonb_build_object('remaining_hp', v_event.remaining_hp),
      true, 'threshold'
    );
  end if;
  if new.is_final_hit then
    perform public.enqueue_world_boss_notification(
      new.event_id, 'final_hit',
      pg_catalog.jsonb_build_object('actor_user_id', new.user_id),
      true, 'final'
    );
    perform public.enqueue_world_boss_notification(
      new.event_id, 'boss_defeated',
      pg_catalog.jsonb_build_object('actor_user_id', new.user_id),
      true, 'defeated'
    );
  end if;
  return new;
end;
$$;

create trigger world_boss_attacks_phase_two
after insert on public.world_boss_attacks
for each row execute function public.track_world_boss_attack_phase_two();

create function public.exchange_and_attack_world_boss(
  p_event_id uuid,
  p_species text,
  p_exchange_request_id uuid,
  p_attack_request_id uuid
)
returns table (
  attack_id uuid, attempted_damage integer, effective_damage integer,
  remaining_hp integer, light_energy integer, is_first_hit boolean, is_final_hit boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exchange_world_boss_energy(p_event_id, 1, p_exchange_request_id);
  return query
  select result.attack_id, result.attempted_damage, result.effective_damage,
    result.remaining_hp, result.light_energy, result.is_first_hit, result.is_final_hit
  from public.attack_world_boss(
    p_event_id, p_species, 3, 'special', p_attack_request_id
  ) result;
end;
$$;

create function public.apply_world_boss_reward_items(p_event_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user record;
  v_save public.game_saves%rowtype;
  v_water bigint;
  v_revision bigint;
  v_applied integer := 0;
begin
  for v_user in
    select item.user_id, pg_catalog.sum(item.water_amount)::integer as water_amount
    from public.world_boss_reward_items item
    where item.event_id = p_event_id and item.status = 'pending'
    group by item.user_id
    order by item.user_id
  loop
    select save.* into strict v_save
    from public.game_saves save where save.user_id = v_user.user_id for update;
    v_water := case
      when coalesce(v_save.snapshot #>> '{data,chromatica.waterDrops}', '') ~ '^[0-9]+$'
        then (v_save.snapshot #>> '{data,chromatica.waterDrops}')::bigint else 0 end;
    v_revision := v_save.revision + 1;
    update public.game_saves save
    set snapshot = pg_catalog.jsonb_set(
          save.snapshot, '{data,chromatica.waterDrops}',
          pg_catalog.to_jsonb((v_water + v_user.water_amount)::text), true
        ),
        revision = v_revision,
        updated_at = pg_catalog.now()
    where save.user_id = v_user.user_id;
    update public.world_boss_reward_items item
    set status = 'applied', applied_revision = v_revision, applied_at = pg_catalog.now()
    where item.event_id = p_event_id and item.user_id = v_user.user_id
      and item.status = 'pending';
    v_applied := v_applied + 1;
  end loop;
  return v_applied;
end;
$$;

create function public.settle_world_boss_event(
  p_event_id uuid,
  p_timestamp timestamptz default pg_catalog.now()
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.world_boss_events%rowtype;
  v_definition public.world_boss_definitions%rowtype;
  v_success boolean;
  v_participant_count integer;
  v_total_attacks bigint;
  v_total_water_spent bigint;
  v_total_rewards bigint;
  v_rankings jsonb;
  v_snapshot jsonb;
begin
  select event.* into strict v_event
  from public.world_boss_events event where event.id = p_event_id for update;
  if v_event.status = 'closed' then return 'closed'; end if;
  if v_event.status = 'active' and v_event.remaining_hp > 0 and p_timestamp < v_event.ends_at then
    return 'active';
  end if;
  v_success := v_event.remaining_hp = 0 or v_event.status = 'defeated';
  update public.world_boss_events event
  set status = 'settling',
      settling_at = coalesce(event.settling_at, p_timestamp),
      updated_at = p_timestamp
  where event.id = p_event_id;
  select definition.* into strict v_definition
  from public.world_boss_definitions definition where definition.boss_key = v_event.boss_key;

  with ranked as (
    select player.user_id, player.total_effective_damage, player.attack_count,
      player.first_attack_at,
      pg_catalog.row_number() over (
        order by player.total_effective_damage desc, player.first_attack_at, player.user_id
      )::integer as final_rank
    from public.world_boss_player_states player
    where player.event_id = p_event_id and player.attack_count > 0
  )
  insert into public.world_boss_rewards (
    event_id, user_id, final_rank, effective_damage, reward_payload
  )
  select p_event_id, ranked.user_id, ranked.final_rank, ranked.total_effective_damage,
    pg_catalog.jsonb_build_object('success', v_success, 'attack_count', ranked.attack_count)
  from ranked
  on conflict (event_id, user_id) do nothing;

  insert into public.world_boss_reward_items (event_id, user_id, reward_type, water_amount)
  select reward.event_id, reward.user_id, 'participation',
    case when v_success then v_definition.success_participation_water
      else v_definition.failure_participation_water end
  from public.world_boss_rewards reward where reward.event_id = p_event_id
  on conflict (event_id, user_id, reward_type) do nothing;

  insert into public.world_boss_reward_items (event_id, user_id, reward_type, water_amount)
  select reward.event_id, reward.user_id, 'rank_' || reward.final_rank::text,
    coalesce(((case when v_success
      then v_definition.success_damage_rank_water
      else v_definition.failure_damage_rank_water
    end) ->> (reward.final_rank - 1))::integer, 0)
  from public.world_boss_rewards reward
  where reward.event_id = p_event_id and reward.final_rank between 1 and 3
  on conflict (event_id, user_id, reward_type) do nothing;

  insert into public.world_boss_reward_items (event_id, user_id, reward_type, water_amount)
  select p_event_id, v_event.first_attacker_user_id, 'first_hit',
    case when v_success then v_definition.success_first_hit_water
      else v_definition.failure_first_hit_water end
  where v_event.first_attacker_user_id is not null
  on conflict (event_id, user_id, reward_type) do nothing;

  insert into public.world_boss_reward_items (event_id, user_id, reward_type, water_amount)
  select p_event_id, v_event.final_attacker_user_id, 'last_hit', v_definition.success_last_hit_water
  where v_success and v_event.final_attacker_user_id is not null
  on conflict (event_id, user_id, reward_type) do nothing;

  insert into public.world_boss_reward_items (event_id, user_id, reward_type, water_amount)
  select reward.event_id, reward.user_id, 'boss_defeated', v_definition.success_boss_defeated_water
  from public.world_boss_rewards reward
  where v_success and reward.event_id = p_event_id
  on conflict (event_id, user_id, reward_type) do nothing;

  perform public.apply_world_boss_reward_items(p_event_id);

  select pg_catalog.count(*), coalesce(pg_catalog.sum(player.attack_count), 0)
  into v_participant_count, v_total_attacks
  from public.world_boss_player_states player
  where player.event_id = p_event_id and player.attack_count > 0;
  select coalesce(pg_catalog.sum(grant_row.water_cost), 0),
    coalesce(pg_catalog.sum(item.water_amount), 0)
  into v_total_water_spent, v_total_rewards
  from public.world_boss_energy_grants grant_row
  full join public.world_boss_reward_items item
    on item.event_id = grant_row.event_id and item.user_id = grant_row.user_id
  where coalesce(grant_row.event_id, item.event_id) = p_event_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', reward.user_id, 'rank', reward.final_rank,
    'damage', reward.effective_damage,
    'attack_count', reward.reward_payload->'attack_count'
  ) order by reward.final_rank), '[]'::jsonb)
  into v_rankings
  from public.world_boss_rewards reward where reward.event_id = p_event_id;

  v_snapshot := pg_catalog.jsonb_build_object(
    'event_id', p_event_id, 'boss_key', v_event.boss_key, 'success', v_success,
    'started_at', v_event.starts_at, 'ended_at', least(p_timestamp, v_event.ends_at),
    'first_attacker_user_id', v_event.first_attacker_user_id,
    'final_attacker_user_id', v_event.final_attacker_user_id,
    'rankings', v_rankings
  );

  insert into public.world_boss_settlement_snapshots (
    event_id, snapshot, participant_count, total_effective_damage,
    total_attack_count, average_attack_count, boss_alive_seconds,
    total_water_spent, event_start_energy_used, practice_energy_used,
    exchanged_energy_used, friday_damage, saturday_damage, sunday_damage,
    normal_attack_count, special_attack_count, total_reward_water
  )
  select p_event_id, v_snapshot, v_participant_count, v_event.total_effective_damage,
    v_total_attacks,
    case when v_participant_count = 0 then 0
      else pg_catalog.round(v_total_attacks::numeric / v_participant_count, 2) end,
    greatest(0, extract(epoch from
      (coalesce(v_event.defeated_at, v_event.ends_at) - v_event.starts_at))::bigint),
    coalesce((select pg_catalog.sum(grant_row.water_cost)
      from public.world_boss_energy_grants grant_row where grant_row.event_id = p_event_id), 0),
    coalesce((select pg_catalog.sum(grant_row.consumed_quantity)
      from public.world_boss_energy_grants grant_row
      where grant_row.event_id = p_event_id and grant_row.source = 'event_start'), 0),
    coalesce((select pg_catalog.sum(grant_row.consumed_quantity)
      from public.world_boss_energy_grants grant_row
      where grant_row.event_id = p_event_id and grant_row.source = 'practice'), 0),
    coalesce((select pg_catalog.sum(grant_row.consumed_quantity)
      from public.world_boss_energy_grants grant_row
      where grant_row.event_id = p_event_id and grant_row.source = 'exchange'), 0),
    coalesce((select pg_catalog.sum(attack.effective_damage)
      from public.world_boss_attacks attack where attack.event_id = p_event_id
        and extract(isodow from attack.created_at at time zone 'Asia/Taipei') = 5), 0),
    coalesce((select pg_catalog.sum(attack.effective_damage)
      from public.world_boss_attacks attack where attack.event_id = p_event_id
        and extract(isodow from attack.created_at at time zone 'Asia/Taipei') = 6), 0),
    coalesce((select pg_catalog.sum(attack.effective_damage)
      from public.world_boss_attacks attack where attack.event_id = p_event_id
        and extract(isodow from attack.created_at at time zone 'Asia/Taipei') = 7), 0),
    coalesce((select pg_catalog.count(*) from public.world_boss_attacks attack
      where attack.event_id = p_event_id and attack.attack_type = 'normal'), 0),
    coalesce((select pg_catalog.count(*) from public.world_boss_attacks attack
      where attack.event_id = p_event_id and attack.attack_type = 'special'), 0),
    coalesce((select pg_catalog.sum(item.water_amount) from public.world_boss_reward_items item
      where item.event_id = p_event_id and item.status = 'applied'), 0)
  on conflict (event_id) do nothing;

  update public.world_boss_rewards reward
  set reward_status = 'applied', applied_at = p_timestamp
  where reward.event_id = p_event_id and reward.reward_status = 'pending';
  update public.world_boss_events event
  set status = 'closed', closed_at = coalesce(event.closed_at, p_timestamp), updated_at = p_timestamp
  where event.id = p_event_id;
  return 'closed';
end;
$$;

create function public.run_world_boss_lifecycle(p_timestamp timestamptz default pg_catalog.now())
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_window record;
  v_event_id uuid;
  v_event public.world_boss_events%rowtype;
  v_previous public.world_boss_events%rowtype;
  v_boss_key text := 'tree-sparrow';
  v_next_order integer;
begin
  for v_event in
    select event.* from public.world_boss_events event
    where event.status in ('active', 'defeated', 'expired', 'settling')
      and (event.remaining_hp = 0 or p_timestamp >= event.ends_at)
    order by event.starts_at for update
  loop
    perform public.settle_world_boss_event(v_event.id, p_timestamp);
  end loop;

  select * into v_window from public.world_boss_window(p_timestamp);
  select event.* into v_event
  from public.world_boss_events event where event.event_key = v_window.event_key;
  if not found then
    select event.* into v_previous from public.world_boss_events event
    where event.event_key < v_window.event_key order by event.event_key desc limit 1;
    if found and v_previous.remaining_hp = 0 then
      select definition.rotation_order + 1 into v_next_order
      from public.world_boss_definitions definition where definition.boss_key = v_previous.boss_key;
      select definition.boss_key into v_boss_key
      from public.world_boss_definitions definition
      where definition.is_active
      order by case when definition.rotation_order >= v_next_order then 0 else 1 end,
        definition.rotation_order limit 1;
    elsif found then
      v_boss_key := v_previous.boss_key;
    end if;
    insert into public.world_boss_events (
      event_key, boss_key, scheduled_at, starts_at, ends_at, status, max_hp, remaining_hp
    )
    select v_window.event_key, definition.boss_key, p_timestamp,
      v_window.starts_at, v_window.ends_at, v_window.phase,
      definition.max_hp, definition.max_hp
    from public.world_boss_definitions definition where definition.boss_key = v_boss_key
    returning id into v_event_id;
  else
    v_event_id := v_event.id;
    update public.world_boss_events event
    set status = case
        when event.status in ('defeated', 'settling', 'closed') then event.status
        when p_timestamp >= event.ends_at then 'expired'
        when p_timestamp >= event.starts_at then 'active'
        else 'scheduled' end,
      updated_at = p_timestamp
    where event.id = v_event_id;
  end if;
  if p_timestamp >= v_window.starts_at and p_timestamp < v_window.ends_at then
    perform public.enqueue_world_boss_notification(
      v_event_id, 'boss_appeared', '{}'::jsonb, true, 'appeared'
    );
  end if;
  return pg_catalog.jsonb_build_object('event_id', v_event_id, 'event_key', v_window.event_key);
end;
$$;

create function public.get_world_boss_battle_context(p_log_limit integer default 30)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  v_event_id := public.ensure_world_boss_event();
  select pg_catalog.jsonb_build_object(
    'event_id', event.id, 'event_key', event.event_key, 'boss_name', definition.display_name,
    'status', event.status, 'starts_at', event.starts_at, 'ends_at', event.ends_at,
    'max_hp', event.max_hp, 'remaining_hp', event.remaining_hp,
    'light_energy', coalesce(player.light_energy, 0),
    'special_attack_count', coalesce(player.special_attack_count, 0),
    'special_attack_remaining', greatest(0, 2 - (
      select pg_catalog.count(*)::integer
      from public.world_boss_attacks daily_special
      where daily_special.event_id = event.id
        and daily_special.user_id = v_user_id
        and daily_special.attack_type = 'special'
        and (daily_special.created_at at time zone 'Asia/Taipei')::date
          = (pg_catalog.now() at time zone 'Asia/Taipei')::date
    )),
    'player_damage', coalesce(player.total_effective_damage, 0),
    'player_attack_count', coalesce(player.attack_count, 0),
    'first_attacker_display_name', (
      select first_profile.display_name
      from public.leaderboard_profiles first_profile
      where first_profile.user_id = event.first_attacker_user_id
    ),
    'final_attacker_display_name', (
      select final_profile.display_name
      from public.leaderboard_profiles final_profile
      where final_profile.user_id = event.final_attacker_user_id
    ),
    'live_ranking', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'rank', ranked.rank_position,
          'display_name', ranked.display_name,
          'avatar_path', ranked.custom_avatar_path,
          'avatar_version', ranked.avatar_version,
          'species', ranked.species,
          'stage', ranked.stage,
          'spirit_name', ranked.spirit_name,
          'damage', ranked.total_effective_damage,
          'attack_count', ranked.attack_count
        )
        order by ranked.rank_position
      )
      from (
        select
          pg_catalog.row_number() over (
            order by live_player.total_effective_damage desc,
              live_player.first_attack_at,
              live_player.user_id
          ) as rank_position,
          live_profile.display_name,
          live_profile.custom_avatar_path,
          live_profile.avatar_version,
          coalesce(latest_attack.species, live_profile.featured_spirit_species) as species,
          coalesce(latest_attack.spirit_stage, live_profile.featured_spirit_stage) as stage,
          live_profile.featured_spirit_name as spirit_name,
          live_player.total_effective_damage,
          live_player.attack_count
        from public.world_boss_player_states live_player
        left join public.leaderboard_profiles live_profile
          on live_profile.user_id = live_player.user_id
        left join lateral (
          select attack.species, attack.spirit_stage
          from public.world_boss_attacks attack
          where attack.event_id = live_player.event_id
            and attack.user_id = live_player.user_id
          order by attack.created_at desc, attack.id desc
          limit 1
        ) latest_attack on true
        where live_player.event_id = event.id
          and live_player.attack_count > 0
        order by live_player.total_effective_damage desc,
          live_player.first_attack_at,
          live_player.user_id
        limit 10
      ) ranked
    ), '[]'::jsonb),
    'is_profile_eligible', exists (
      select 1 from public.leaderboard_profiles profile where profile.user_id = v_user_id
        and profile.is_active and profile.profile_completed and profile.consented_at is not null
    ),
    'battle_log', coalesce((
      select pg_catalog.jsonb_agg(log_row.value order by log_row.created_at desc)
      from (
        select attack.created_at,
          pg_catalog.jsonb_build_object(
            'id', attack.id, 'created_at', attack.created_at,
            'display_name', profile.display_name, 'attack_type', attack.attack_type,
            'skill_name', unlock.skill_name, 'damage', attack.effective_damage,
            'is_first_hit', attack.is_first_hit, 'is_final_hit', attack.is_final_hit
          ) as value
        from public.world_boss_attacks attack
        left join public.leaderboard_profiles profile on profile.user_id = attack.user_id
        left join public.world_boss_skill_unlocks unlock
          on unlock.user_id = attack.user_id and unlock.species = attack.species
        where attack.event_id = event.id
        order by attack.created_at desc limit least(greatest(p_log_limit, 1), 50)
      ) log_row
    ), '[]'::jsonb),
    'settlement', snapshot.snapshot
  ) into v_result
  from public.world_boss_events event
  join public.world_boss_definitions definition on definition.boss_key = event.boss_key
  left join public.world_boss_player_states player
    on player.event_id = event.id and player.user_id = v_user_id
  left join public.world_boss_settlement_snapshots snapshot on snapshot.event_id = event.id
  where event.id = v_event_id;
  return v_result;
end;
$$;

create function public.get_world_boss_settlement(p_event_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'snapshot', snapshot.snapshot,
    'participant_count', snapshot.participant_count,
    'total_attack_count', snapshot.total_attack_count,
    'boss_alive_seconds', snapshot.boss_alive_seconds,
    'top_ten', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rank', reward.final_rank, 'display_name', profile.display_name,
        'avatar_path', profile.custom_avatar_path, 'damage', reward.effective_damage,
        'attack_count', reward.reward_payload->'attack_count'
      ) order by reward.final_rank)
      from public.world_boss_rewards reward
      left join public.leaderboard_profiles profile on profile.user_id = reward.user_id
      where reward.event_id = p_event_id and reward.final_rank <= 10
    ), '[]'::jsonb),
    'me', (
      select pg_catalog.jsonb_build_object(
        'rank', reward.final_rank, 'damage', reward.effective_damage,
        'attack_count', reward.reward_payload->'attack_count',
        'rewards', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'type', item.reward_type, 'water', item.water_amount
          ) order by case item.reward_type
            when 'participation' then 1
            when 'first_hit' then 2
            when 'rank_1' then 3
            when 'rank_2' then 3
            when 'rank_3' then 3
            when 'last_hit' then 4
            when 'boss_defeated' then 5
            else 9 end)
          from public.world_boss_reward_items item
          where item.event_id = reward.event_id and item.user_id = reward.user_id
        ), '[]'::jsonb)
      )
      from public.world_boss_rewards reward
      where reward.event_id = p_event_id and reward.user_id = auth.uid()
    )
  )
  from public.world_boss_settlement_snapshots snapshot where snapshot.event_id = p_event_id;
$$;

create function public.get_my_world_boss_notifications()
returns table (id uuid, event_id uuid, notification_type text, payload jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select queue.id, queue.event_id, queue.notification_type, queue.payload, queue.created_at
  from public.world_boss_notification_queue queue
  where queue.user_id = auth.uid() and queue.in_app and queue.read_at is null
  order by queue.created_at desc limit 20;
$$;

create function public.read_world_boss_notification(p_notification_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.world_boss_notification_queue queue
  set read_at = coalesce(queue.read_at, pg_catalog.now())
  where queue.id = p_notification_id and queue.user_id = auth.uid() and queue.in_app;
  return found;
end;
$$;

create function public.claim_world_boss_notification_queue(p_limit integer default 20)
returns table (
  id uuid, event_id uuid, user_id uuid, notification_type text,
  payload jsonb, attempts integer
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select queue.id from public.world_boss_notification_queue queue
    where queue.push and queue.status in ('pending', 'retry')
      and queue.next_attempt_at <= pg_catalog.now()
    order by queue.created_at
    for update skip locked limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update public.world_boss_notification_queue queue
    set status = 'processing', attempts = queue.attempts + 1
    from candidates where queue.id = candidates.id
    returning queue.*
  )
  select claimed.id, claimed.event_id, claimed.user_id, claimed.notification_type,
    claimed.payload, claimed.attempts from claimed;
end;
$$;

revoke all on function public.enqueue_world_boss_notification(uuid,text,jsonb,boolean,text),
  public.track_world_boss_attack_phase_two(),
  public.exchange_and_attack_world_boss(uuid,text,uuid,uuid),
  public.apply_world_boss_reward_items(uuid),
  public.settle_world_boss_event(uuid,timestamptz),
  public.run_world_boss_lifecycle(timestamptz),
  public.get_world_boss_battle_context(integer),
  public.get_world_boss_settlement(uuid),
  public.get_my_world_boss_notifications(),
  public.read_world_boss_notification(uuid),
  public.claim_world_boss_notification_queue(integer)
from public, anon, authenticated;

grant execute on function public.get_world_boss_battle_context(integer),
  public.get_world_boss_settlement(uuid),
  public.get_my_world_boss_notifications(),
  public.read_world_boss_notification(uuid),
  public.exchange_and_attack_world_boss(uuid,text,uuid,uuid)
to authenticated;
grant execute on function public.enqueue_world_boss_notification(uuid,text,jsonb,boolean,text),
  public.apply_world_boss_reward_items(uuid),
  public.settle_world_boss_event(uuid,timestamptz),
  public.run_world_boss_lifecycle(timestamptz),
  public.claim_world_boss_notification_queue(integer)
to service_role;

-- Deployment draft only; no cron is created by this migration.
-- Lifecycle: every five minutes -> select public.run_world_boss_lifecycle();
-- Notification dispatch: every five minutes -> invoke process-world-boss-notifications.

commit;
