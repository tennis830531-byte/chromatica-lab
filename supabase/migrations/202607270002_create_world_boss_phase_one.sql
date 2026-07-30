begin;

create table public.world_boss_definitions (
  boss_key text primary key,
  display_name text not null,
  max_hp integer not null check (max_hp > 0),
  normal_asset_path text not null,
  enraged_asset_path text not null,
  defeated_asset_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now()
);

insert into public.world_boss_definitions
  (boss_key, display_name, max_hp, normal_asset_path, enraged_asset_path, defeated_asset_path)
values (
  'tree-sparrow',
  '樹麻雀',
  3000,
  '第一隻boss 樹麻雀.png',
  '第一隻boss 樹麻雀 狂暴狀態.png',
  '第一隻boss樹麻雀 死亡狀態.png'
);

create table public.world_boss_events (
  id uuid primary key default gen_random_uuid(),
  event_key date not null unique,
  boss_key text not null references public.world_boss_definitions(boss_key),
  scheduled_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'defeated', 'expired', 'settling', 'closed')),
  max_hp integer not null check (max_hp > 0),
  remaining_hp integer not null check (remaining_hp between 0 and max_hp),
  total_effective_damage bigint not null default 0 check (total_effective_damage >= 0),
  first_attacker_user_id uuid references auth.users(id),
  final_attacker_user_id uuid references auth.users(id),
  defeated_at timestamptz,
  settling_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (starts_at < ends_at)
);

create table public.world_boss_player_states (
  event_id uuid not null references public.world_boss_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  light_energy integer not null default 1 check (light_energy >= 0),
  purchased_energy_count integer not null default 0 check (purchased_energy_count >= 0),
  special_attack_count integer not null default 0 check (special_attack_count between 0 and 6),
  total_effective_damage bigint not null default 0 check (total_effective_damage >= 0),
  attack_count integer not null default 0 check (attack_count >= 0),
  first_attack_at timestamptz,
  last_attack_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (event_id, user_id)
);

create table public.world_boss_energy_grants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.world_boss_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('event_start', 'practice', 'exchange')),
  grant_date date,
  quantity integer not null check (quantity > 0),
  water_cost integer not null default 0 check (water_cost >= 0),
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (event_id, user_id, request_id)
);

create unique index world_boss_energy_daily_practice_uidx
  on public.world_boss_energy_grants (event_id, user_id, grant_date)
  where source = 'practice';

create unique index world_boss_energy_event_start_uidx
  on public.world_boss_energy_grants (event_id, user_id)
  where source = 'event_start';

create table public.world_boss_skill_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  species text not null check (species in ('melody-sprout', 'mushroom-spirit', 'flower-spirit', 'lucky-clover-spirit', 'lotus-spirit', 'cactus-spirit')),
  skill_name text not null,
  water_cost integer not null default 100 check (water_cost = 100),
  request_id uuid not null,
  applied_revision bigint not null,
  unlocked_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, species),
  unique (user_id, request_id)
);

create table public.world_boss_attacks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.world_boss_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  species text not null check (species in ('melody-sprout', 'mushroom-spirit', 'flower-spirit', 'lucky-clover-spirit', 'lotus-spirit', 'cactus-spirit')),
  spirit_stage smallint not null check (spirit_stage between 1 and 3),
  attack_type text not null check (attack_type in ('normal', 'special')),
  attempted_damage integer not null check (attempted_damage in (10, 30, 60, 100)),
  effective_damage integer not null check (effective_damage between 0 and attempted_damage),
  energy_spent integer not null default 0 check (energy_spent in (0, 1)),
  is_first_hit boolean not null default false,
  is_final_hit boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  unique (event_id, user_id, request_id)
);

create unique index world_boss_attacks_first_hit_uidx
  on public.world_boss_attacks (event_id) where is_first_hit;
create unique index world_boss_attacks_final_hit_uidx
  on public.world_boss_attacks (event_id) where is_final_hit;
create index world_boss_attacks_damage_idx
  on public.world_boss_attacks (event_id, effective_damage desc, created_at);
create index world_boss_attacks_daily_special_idx
  on public.world_boss_attacks (event_id, user_id, attack_type, created_at);

create table public.world_boss_rewards (
  event_id uuid not null references public.world_boss_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_rank integer,
  effective_damage bigint not null default 0,
  reward_payload jsonb not null default '{}'::jsonb,
  reward_status text not null default 'pending'
    check (reward_status in ('pending', 'applied', 'cancelled')),
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'skipped', 'failed')),
  applied_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (event_id, user_id)
);

create table public.world_boss_settlement_snapshots (
  event_id uuid primary key references public.world_boss_events(id) on delete cascade,
  snapshot jsonb not null check (pg_catalog.jsonb_typeof(snapshot) = 'object'),
  participant_count integer not null default 0,
  total_effective_damage bigint not null default 0,
  created_at timestamptz not null default pg_catalog.now()
);

create function public.reject_world_boss_snapshot_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'world boss settlement snapshots are immutable';
end;
$$;

create trigger world_boss_settlement_snapshots_immutable
before update or delete on public.world_boss_settlement_snapshots
for each row execute function public.reject_world_boss_snapshot_mutation();

alter table public.world_boss_definitions enable row level security;
alter table public.world_boss_events enable row level security;
alter table public.world_boss_player_states enable row level security;
alter table public.world_boss_energy_grants enable row level security;
alter table public.world_boss_skill_unlocks enable row level security;
alter table public.world_boss_attacks enable row level security;
alter table public.world_boss_rewards enable row level security;
alter table public.world_boss_settlement_snapshots enable row level security;

revoke all on public.world_boss_definitions, public.world_boss_events,
  public.world_boss_player_states, public.world_boss_energy_grants,
  public.world_boss_skill_unlocks, public.world_boss_attacks,
  public.world_boss_rewards, public.world_boss_settlement_snapshots
from public, anon, authenticated;
grant select, insert, update, delete on public.world_boss_definitions, public.world_boss_events,
  public.world_boss_player_states, public.world_boss_energy_grants,
  public.world_boss_skill_unlocks, public.world_boss_attacks,
  public.world_boss_rewards, public.world_boss_settlement_snapshots
to service_role;

create function public.world_boss_window(p_timestamp timestamptz default pg_catalog.now())
returns table (event_key date, starts_at timestamptz, ends_at timestamptz, phase text)
language sql stable security definer set search_path = '' as $$
  with local_now as (
    select p_timestamp at time zone 'Asia/Taipei' as value
  ), this_window as (
    select
      (pg_catalog.date_trunc('week', value) + interval '4 days 20 hours') as local_start,
      (pg_catalog.date_trunc('week', value) + interval '6 days 22 hours') as local_end
    from local_now
  ), selected as (
    select
      case when p_timestamp >= local_end at time zone 'Asia/Taipei'
        then local_start + interval '7 days' else local_start end as local_start,
      case when p_timestamp >= local_end at time zone 'Asia/Taipei'
        then local_end + interval '7 days' else local_end end as local_end
    from this_window
  )
  select
    local_start::date,
    local_start at time zone 'Asia/Taipei',
    local_end at time zone 'Asia/Taipei',
    case
      when p_timestamp < local_start at time zone 'Asia/Taipei' then 'scheduled'
      when p_timestamp < local_end at time zone 'Asia/Taipei' then 'active'
      else 'expired'
    end
  from selected;
$$;

create function public.ensure_world_boss_event(p_timestamp timestamptz default pg_catalog.now())
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_window record;
  v_id uuid;
begin
  select * into v_window from public.world_boss_window(p_timestamp);
  insert into public.world_boss_events
    (event_key, boss_key, scheduled_at, starts_at, ends_at, status, max_hp, remaining_hp)
  values (
    v_window.event_key, 'tree-sparrow', p_timestamp, v_window.starts_at, v_window.ends_at,
    v_window.phase, 3000, 3000
  )
  on conflict (event_key) do nothing;
  select event.id into strict v_id
  from public.world_boss_events event where event.event_key = v_window.event_key;
  update public.world_boss_events event
  set status = case
        when event.status in ('defeated', 'settling', 'closed') then event.status
        when p_timestamp >= event.ends_at then 'expired'
        when p_timestamp >= event.starts_at then 'active'
        else 'scheduled'
      end,
      updated_at = p_timestamp
  where event.id = v_id;
  return v_id;
end;
$$;

create function public.get_world_boss_status()
returns table (
  event_id uuid, event_key date, boss_name text, status text,
  starts_at timestamptz, ends_at timestamptz, max_hp integer, remaining_hp integer,
  light_energy integer, purchased_energy_count integer, special_attack_count integer,
  player_damage bigint, is_profile_eligible boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  v_event_id := public.ensure_world_boss_event();
  return query
  select event.id, event.event_key, definition.display_name, event.status,
    event.starts_at, event.ends_at, event.max_hp, event.remaining_hp,
    coalesce(player.light_energy, 0), coalesce(player.purchased_energy_count, 0),
    coalesce((
      select pg_catalog.count(*)::integer
      from public.world_boss_attacks attack
      where attack.event_id = event.id
        and attack.user_id = v_user_id
        and attack.attack_type = 'special'
        and (attack.created_at at time zone 'Asia/Taipei')::date
          = (pg_catalog.now() at time zone 'Asia/Taipei')::date
    ), 0),
    coalesce(player.total_effective_damage, 0),
    exists (
      select 1 from public.leaderboard_profiles profile
      where profile.user_id = v_user_id and profile.is_active
        and profile.profile_completed and profile.consented_at is not null
    )
  from public.world_boss_events event
  join public.world_boss_definitions definition on definition.boss_key = event.boss_key
  left join public.world_boss_player_states player
    on player.event_id = event.id and player.user_id = v_user_id
  where event.id = v_event_id;
end;
$$;

create function public.get_my_world_boss_skills()
returns table (species text, skill_name text, unlocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select unlock.species, unlock.skill_name, unlock.unlocked_at
  from public.world_boss_skill_unlocks unlock
  where unlock.user_id = auth.uid()
  order by unlock.unlocked_at;
$$;

create function public.world_boss_harvested_stage(p_user_id uuid, p_species text)
returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_raw text;
  v_collection jsonb;
  v_stage integer;
begin
  select save.snapshot #>> '{data,chromatica.spiritCollection}' into v_raw
  from public.game_saves save where save.user_id = p_user_id;
  if coalesce(v_raw, '') = '' then return 0; end if;
  begin
    v_collection := v_raw::jsonb;
  exception when others then
    return 0;
  end;
  if pg_catalog.jsonb_typeof(v_collection) <> 'array' then return 0; end if;
  select coalesce(pg_catalog.max((item->>'stage')::integer), 0) into v_stage
  from pg_catalog.jsonb_array_elements(v_collection) item
  where item->>'species' = p_species
    and coalesce((item->>'harvested')::boolean, false)
    and coalesce(item->>'stage', '') ~ '^[1-3]$';
  return coalesce(v_stage, 0);
end;
$$;

create function public.world_boss_owned_stage(p_user_id uuid, p_species text)
returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_harvested_stage integer := public.world_boss_harvested_stage(p_user_id, p_species);
  v_raw text;
  v_current jsonb;
  v_progress integer;
  v_current_stage integer := 0;
begin
  select save.snapshot #>> '{data,chromatica.currentPlant}' into v_raw
  from public.game_saves save where save.user_id = p_user_id;
  if coalesce(v_raw, '') = '' then return v_harvested_stage; end if;
  begin
    v_current := v_raw::jsonb;
  exception when others then
    return v_harvested_stage;
  end;
  if pg_catalog.jsonb_typeof(v_current) <> 'object'
     or coalesce(v_current->>'id', '') = ''
     or v_current->>'species' <> p_species then
    return v_harvested_stage;
  end if;
  if coalesce(v_current->>'waterProgress', '') ~ '^[0-9]+$' then
    v_progress := least(530, greatest(0, (v_current->>'waterProgress')::integer));
    v_current_stage := case
      when v_progress >= 280 then 3
      when v_progress >= 100 then 2
      else 1
    end;
  elsif coalesce(v_current->>'stage', '') ~ '^[1-3]$' then
    v_current_stage := (v_current->>'stage')::integer;
  else
    v_current_stage := 1;
  end if;
  return greatest(v_harvested_stage, v_current_stage);
end;
$$;

create function public.learn_world_boss_skill(p_species text, p_request_id uuid)
returns table (species text, skill_name text, unlocked_at timestamptz, applied_revision bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.world_boss_skill_unlocks%rowtype;
  v_save public.game_saves%rowtype;
  v_water bigint;
  v_revision bigint;
  v_skill_name text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id required'; end if;
  v_skill_name := case p_species
    when 'melody-sprout' then '森律共鳴・萬葉齊奏'
    when 'mushroom-spirit' then '菌界低吟・大地回響'
    when 'flower-spirit' then '花舞天音・百華綻放'
    when 'lucky-clover-spirit' then '四葉福音・命運盛放'
    when 'lotus-spirit' then '蓮華天籟・萬瓣淨音'
    when 'cactus-spirit' then '荒沙戰奏・烈日轟鳴'
    else null end;
  if v_skill_name is null then raise exception 'unsupported spirit'; end if;

  select unlock.* into v_existing
  from public.world_boss_skill_unlocks unlock
  where unlock.user_id = v_user_id and unlock.species = p_species;
  if found then
    return query select v_existing.species, v_existing.skill_name,
      v_existing.unlocked_at, v_existing.applied_revision;
    return;
  end if;
  if public.world_boss_harvested_stage(v_user_id, p_species) <> 3 then
    raise exception 'harvested third-stage spirit required';
  end if;

  select save.* into strict v_save from public.game_saves save
  where save.user_id = v_user_id for update;
  select unlock.* into v_existing
  from public.world_boss_skill_unlocks unlock
  where unlock.user_id = v_user_id and unlock.species = p_species;
  if found then
    return query select v_existing.species, v_existing.skill_name,
      v_existing.unlocked_at, v_existing.applied_revision;
    return;
  end if;
  v_water := case
    when coalesce(v_save.snapshot #>> '{data,chromatica.waterDrops}', '') ~ '^[0-9]+$'
      then (v_save.snapshot #>> '{data,chromatica.waterDrops}')::bigint else 0 end;
  if v_water < 100 then raise exception 'insufficient water'; end if;
  v_revision := v_save.revision + 1;
  update public.game_saves save
  set snapshot = pg_catalog.jsonb_set(
        save.snapshot, '{data,chromatica.waterDrops}',
        pg_catalog.to_jsonb((v_water - 100)::text), true
      ),
      revision = v_revision, updated_at = pg_catalog.now()
  where save.user_id = v_user_id;
  insert into public.world_boss_skill_unlocks
    (user_id, species, skill_name, request_id, applied_revision)
  values (v_user_id, p_species, v_skill_name, p_request_id, v_revision)
  returning world_boss_skill_unlocks.* into v_existing;
  return query select v_existing.species, v_existing.skill_name,
    v_existing.unlocked_at, v_existing.applied_revision;
end;
$$;

create function public.initialize_world_boss_player(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.world_boss_player_states (event_id, user_id, light_energy)
  values (p_event_id, p_user_id, 1)
  on conflict (event_id, user_id) do nothing;
  insert into public.world_boss_energy_grants
    (event_id, user_id, source, quantity, request_id)
  values (p_event_id, p_user_id, 'event_start', 1, gen_random_uuid())
  on conflict do nothing;
end;
$$;

create function public.grant_world_boss_practice_energy(
  p_practice_date date,
  p_request_id uuid
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_event public.world_boss_events%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.leaderboard_profiles profile
    where profile.user_id = v_user_id and profile.is_active
      and profile.profile_completed and profile.consented_at is not null
  ) then return 0; end if;
  v_event_id := public.ensure_world_boss_event();
  select event.* into strict v_event from public.world_boss_events event
  where event.id = v_event_id for update;
  if v_event.status <> 'active'
     or p_practice_date <> (pg_catalog.now() at time zone 'Asia/Taipei')::date
     or p_practice_date < (v_event.starts_at at time zone 'Asia/Taipei')::date
     or p_practice_date > (v_event.ends_at at time zone 'Asia/Taipei')::date then
    return 0;
  end if;
  perform public.initialize_world_boss_player(v_event_id, v_user_id);
  insert into public.world_boss_energy_grants
    (event_id, user_id, source, grant_date, quantity, request_id)
  values (v_event_id, v_user_id, 'practice', p_practice_date, 1, p_request_id)
  on conflict do nothing;
  if not found then return 0; end if;
  update public.world_boss_player_states player
  set light_energy = player.light_energy + 1, updated_at = pg_catalog.now()
  where player.event_id = v_event_id and player.user_id = v_user_id;
  return 1;
end;
$$;

create function public.exchange_world_boss_energy(
  p_event_id uuid, p_quantity integer, p_request_id uuid
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.world_boss_events%rowtype;
  v_player public.world_boss_player_states%rowtype;
  v_save public.game_saves%rowtype;
  v_water bigint;
  v_cost integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_quantity < 1 then raise exception 'invalid energy quantity'; end if;
  if exists (
    select 1 from public.world_boss_energy_grants grant_row
    where grant_row.event_id = p_event_id and grant_row.user_id = v_user_id
      and grant_row.request_id = p_request_id
  ) then
    select player.light_energy into v_player.light_energy
    from public.world_boss_player_states player
    where player.event_id = p_event_id and player.user_id = v_user_id;
    return v_player.light_energy;
  end if;
  select event.* into strict v_event from public.world_boss_events event
  where event.id = p_event_id for update;
  if v_event.status <> 'active' or v_event.remaining_hp <= 0
     or pg_catalog.now() < v_event.starts_at or pg_catalog.now() >= v_event.ends_at then
    raise exception 'boss is not active';
  end if;
  perform public.initialize_world_boss_player(p_event_id, v_user_id);
  select player.* into strict v_player from public.world_boss_player_states player
  where player.event_id = p_event_id and player.user_id = v_user_id for update;
  select save.* into strict v_save from public.game_saves save
  where save.user_id = v_user_id for update;
  v_water := case
    when coalesce(v_save.snapshot #>> '{data,chromatica.waterDrops}', '') ~ '^[0-9]+$'
      then (v_save.snapshot #>> '{data,chromatica.waterDrops}')::bigint else 0 end;
  v_cost := p_quantity * 3;
  if v_water < v_cost then raise exception 'insufficient water'; end if;
  update public.game_saves save
  set snapshot = pg_catalog.jsonb_set(
        save.snapshot, '{data,chromatica.waterDrops}',
        pg_catalog.to_jsonb((v_water - v_cost)::text), true
      ),
      revision = save.revision + 1, updated_at = pg_catalog.now()
  where save.user_id = v_user_id;
  update public.world_boss_player_states player
  set light_energy = player.light_energy + p_quantity,
      purchased_energy_count = player.purchased_energy_count + p_quantity,
      updated_at = pg_catalog.now()
  where player.event_id = p_event_id and player.user_id = v_user_id
  returning player.* into v_player;
  insert into public.world_boss_energy_grants
    (event_id, user_id, source, quantity, water_cost, request_id)
  values (p_event_id, v_user_id, 'exchange', p_quantity, v_cost, p_request_id);
  return v_player.light_energy;
end;
$$;

create function public.attack_world_boss(
  p_event_id uuid,
  p_species text,
  p_stage integer,
  p_attack_type text,
  p_request_id uuid
)
returns table (
  attack_id uuid, attempted_damage integer, effective_damage integer,
  remaining_hp integer, light_energy integer, is_first_hit boolean, is_final_hit boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.world_boss_events%rowtype;
  v_player public.world_boss_player_states%rowtype;
  v_existing public.world_boss_attacks%rowtype;
  v_attempted integer;
  v_effective integer;
  v_first boolean;
  v_final boolean;
  v_daily_special_attack_count integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id required'; end if;
  if not exists (
    select 1 from public.leaderboard_profiles profile
    where profile.user_id = v_user_id and profile.is_active
      and profile.profile_completed and profile.consented_at is not null
  ) then raise exception 'completed leaderboard profile required'; end if;
  select attack.* into v_existing from public.world_boss_attacks attack
  where attack.event_id = p_event_id and attack.user_id = v_user_id
    and attack.request_id = p_request_id;
  if found then
    select event.remaining_hp into v_event.remaining_hp
    from public.world_boss_events event where event.id = p_event_id;
    select player.light_energy into v_player.light_energy
    from public.world_boss_player_states player
    where player.event_id = p_event_id and player.user_id = v_user_id;
    return query select v_existing.id, v_existing.attempted_damage,
      v_existing.effective_damage, v_event.remaining_hp, coalesce(v_player.light_energy, 0),
      v_existing.is_first_hit, v_existing.is_final_hit;
    return;
  end if;
  select event.* into strict v_event from public.world_boss_events event
  where event.id = p_event_id for update;
  if v_event.status <> 'active' or v_event.remaining_hp <= 0
     or pg_catalog.now() < v_event.starts_at or pg_catalog.now() >= v_event.ends_at then
    raise exception 'boss is not active';
  end if;
  if p_species not in ('melody-sprout', 'mushroom-spirit', 'flower-spirit', 'lucky-clover-spirit', 'lotus-spirit', 'cactus-spirit')
     or p_stage not between 1 and 3 then raise exception 'invalid spirit'; end if;
  if public.world_boss_owned_stage(v_user_id, p_species) < p_stage then
    raise exception 'spirit stage not owned';
  end if;
  perform public.initialize_world_boss_player(p_event_id, v_user_id);
  select player.* into strict v_player from public.world_boss_player_states player
  where player.event_id = p_event_id and player.user_id = v_user_id for update;
  if p_attack_type = 'special' then
    if p_stage <> 3 or not exists (
      select 1 from public.world_boss_skill_unlocks unlock
      where unlock.user_id = v_user_id and unlock.species = p_species
    ) then raise exception 'special skill not learned'; end if;
    select pg_catalog.count(*)::integer into v_daily_special_attack_count
    from public.world_boss_attacks attack
    where attack.event_id = p_event_id
      and attack.user_id = v_user_id
      and attack.attack_type = 'special'
      and (attack.created_at at time zone 'Asia/Taipei')::date
        = (pg_catalog.now() at time zone 'Asia/Taipei')::date;
    if v_daily_special_attack_count >= 2 then
      raise exception 'daily special attack limit reached';
    end if;
    if v_player.light_energy < 1 then raise exception 'insufficient light energy'; end if;
    v_attempted := 100;
  elsif p_attack_type = 'normal' then
    v_attempted := case p_stage when 1 then 10 when 2 then 30 when 3 then 60 end;
  else raise exception 'invalid attack type';
  end if;
  v_effective := least(v_attempted, v_event.remaining_hp);
  v_first := v_event.total_effective_damage = 0;
  v_final := v_effective = v_event.remaining_hp;

  update public.world_boss_events event
  set remaining_hp = event.remaining_hp - v_effective,
      total_effective_damage = event.total_effective_damage + v_effective,
      first_attacker_user_id = case when v_first then v_user_id else event.first_attacker_user_id end,
      final_attacker_user_id = case when v_final then v_user_id else event.final_attacker_user_id end,
      status = case when v_final then 'defeated' else event.status end,
      defeated_at = case when v_final then pg_catalog.now() else event.defeated_at end,
      updated_at = pg_catalog.now()
  where event.id = p_event_id
  returning event.* into v_event;
  update public.world_boss_player_states player
  set light_energy = player.light_energy - case when p_attack_type = 'special' then 1 else 0 end,
      special_attack_count = player.special_attack_count + case when p_attack_type = 'special' then 1 else 0 end,
      total_effective_damage = player.total_effective_damage + v_effective,
      attack_count = player.attack_count + 1,
      first_attack_at = coalesce(player.first_attack_at, pg_catalog.now()),
      last_attack_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where player.event_id = p_event_id and player.user_id = v_user_id
  returning player.* into v_player;
  insert into public.world_boss_attacks (
    event_id, user_id, request_id, species, spirit_stage, attack_type,
    attempted_damage, effective_damage, energy_spent, is_first_hit, is_final_hit
  ) values (
    p_event_id, v_user_id, p_request_id, p_species, p_stage, p_attack_type,
    v_attempted, v_effective, case when p_attack_type = 'special' then 1 else 0 end,
    v_first, v_final
  ) returning world_boss_attacks.* into v_existing;
  return query select v_existing.id, v_attempted, v_effective, v_event.remaining_hp,
    v_player.light_energy, v_first, v_final;
end;
$$;

revoke all on function public.world_boss_window(timestamptz),
  public.ensure_world_boss_event(timestamptz),
  public.get_world_boss_status(),
  public.get_my_world_boss_skills(),
  public.world_boss_harvested_stage(uuid, text),
  public.world_boss_owned_stage(uuid, text),
  public.learn_world_boss_skill(text, uuid),
  public.initialize_world_boss_player(uuid, uuid),
  public.grant_world_boss_practice_energy(date, uuid),
  public.exchange_world_boss_energy(uuid, integer, uuid),
  public.attack_world_boss(uuid, text, integer, text, uuid)
from public, anon;

grant execute on function public.get_world_boss_status(),
  public.get_my_world_boss_skills(),
  public.learn_world_boss_skill(text, uuid),
  public.grant_world_boss_practice_energy(date, uuid),
  public.exchange_world_boss_energy(uuid, integer, uuid),
  public.attack_world_boss(uuid, text, integer, text, uuid)
to authenticated;

grant execute on function public.world_boss_window(timestamptz),
  public.ensure_world_boss_event(timestamptz),
  public.world_boss_harvested_stage(uuid, text),
  public.world_boss_owned_stage(uuid, text),
  public.initialize_world_boss_player(uuid, uuid)
to service_role;

commit;
