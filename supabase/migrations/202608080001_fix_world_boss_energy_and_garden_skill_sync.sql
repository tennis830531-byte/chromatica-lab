begin;

-- Event-start energy is claimed independently from practice energy.  The grant
-- row is the idempotency guard; player state is incremented only when that row
-- is inserted by this transaction.
create or replace function public.claim_world_boss_event_start_energy(
  p_event_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.world_boss_events%rowtype;
  v_inserted integer := 0;
begin
  select event.* into strict v_event
  from public.world_boss_events event
  where event.id = p_event_id
  for update;

  if pg_catalog.now() < v_event.starts_at
     or v_event.status = 'scheduled'
     or not exists (
       select 1
       from public.leaderboard_profiles profile
       where profile.user_id = p_user_id
         and profile.is_active
         and profile.profile_completed
         and profile.consented_at is not null
     ) then
    return false;
  end if;

  insert into public.world_boss_player_states (event_id, user_id, light_energy)
  values (p_event_id, p_user_id, 0)
  on conflict (event_id, user_id) do nothing;

  insert into public.world_boss_energy_grants
    (event_id, user_id, source, quantity, request_id)
  values (p_event_id, p_user_id, 'event_start', 1, gen_random_uuid())
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.world_boss_player_states player
    set light_energy = player.light_energy + 1,
        updated_at = pg_catalog.now()
    where player.event_id = p_event_id
      and player.user_id = p_user_id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.initialize_world_boss_player(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.claim_world_boss_event_start_energy(p_event_id, p_user_id);
end;
$$;

create function public.get_world_boss_battle_context_v2(p_log_limit integer default 30)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  v_event_id := public.ensure_world_boss_event();
  perform public.claim_world_boss_event_start_energy(v_event_id, v_user_id);
  return public.get_world_boss_battle_context(p_log_limit);
end;
$$;

create or replace function public.get_world_boss_status()
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
  perform public.claim_world_boss_event_start_energy(v_event_id, v_user_id);
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

create function public.grant_world_boss_practice_energy_v2(p_request_id uuid)
returns table (
  event_id uuid,
  light_energy integer,
  world_boss_event_start_energy_granted boolean,
  world_boss_daily_practice_energy_granted boolean,
  practice_date date
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_event public.world_boss_events%rowtype;
  v_practice_date date := (pg_catalog.now() at time zone 'Asia/Taipei')::date;
  v_event_start_granted boolean := false;
  v_daily_granted boolean := false;
  v_inserted integer := 0;
  v_energy integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id required'; end if;
  if not exists (
    select 1 from public.leaderboard_profiles profile
    where profile.user_id = v_user_id and profile.is_active
      and profile.profile_completed and profile.consented_at is not null
  ) then
    return query select null::uuid, 0, false, false, v_practice_date;
    return;
  end if;

  v_event_id := public.ensure_world_boss_event();
  select event.* into strict v_event
  from public.world_boss_events event
  where event.id = v_event_id
  for update;

  if v_event.status <> 'active'
     or v_practice_date < (v_event.starts_at at time zone 'Asia/Taipei')::date
     or v_practice_date > (v_event.ends_at at time zone 'Asia/Taipei')::date then
    return query select v_event_id, coalesce((
      select player.light_energy from public.world_boss_player_states player
      where player.event_id = v_event_id and player.user_id = v_user_id
    ), 0), false, false, v_practice_date;
    return;
  end if;

  v_event_start_granted := public.claim_world_boss_event_start_energy(v_event_id, v_user_id);
  insert into public.world_boss_energy_grants
    (event_id, user_id, source, grant_date, quantity, request_id)
  values (v_event_id, v_user_id, 'practice', v_practice_date, 1, p_request_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  v_daily_granted := v_inserted = 1;

  if v_daily_granted then
    update public.world_boss_player_states player
    set light_energy = player.light_energy + 1,
        updated_at = pg_catalog.now()
    where player.event_id = v_event_id and player.user_id = v_user_id;
  end if;

  select player.light_energy into v_energy
  from public.world_boss_player_states player
  where player.event_id = v_event_id and player.user_id = v_user_id;

  return query select v_event_id, coalesce(v_energy, 0),
    v_event_start_granted, v_daily_granted, v_practice_date;
end;
$$;

create or replace function public.grant_world_boss_practice_energy(
  p_practice_date date,
  p_request_id uuid
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_granted boolean := false;
begin
  -- p_practice_date remains for backwards compatibility only.  The server's
  -- Asia/Taipei date is authoritative.
  select result.world_boss_daily_practice_energy_granted into v_granted
  from public.grant_world_boss_practice_energy_v2(p_request_id) result;
  return case when v_granted then 1 else 0 end;
end;
$$;

drop function public.exchange_and_attack_world_boss(uuid,text,integer,text,uuid,uuid);
create function public.exchange_and_attack_world_boss(
  p_event_id uuid,
  p_species text,
  p_stage integer,
  p_attack_type text,
  p_exchange_request_id uuid,
  p_attack_request_id uuid
)
returns table (
  attack_id uuid,
  attempted_damage integer,
  effective_damage integer,
  remaining_hp integer,
  light_energy integer,
  is_first_hit boolean,
  is_final_hit boolean,
  water_drops bigint,
  game_save_revision bigint,
  game_save_snapshot jsonb,
  game_save_updated_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.world_boss_attacks%rowtype;
  v_attack record;
  v_save public.game_saves%rowtype;
  v_water bigint;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_exchange_request_id is null or p_attack_request_id is null then
    raise exception 'request id required';
  end if;

  select attack.* into v_existing
  from public.world_boss_attacks attack
  where attack.event_id = p_event_id
    and attack.user_id = v_user_id
    and attack.request_id = p_attack_request_id;

  if not found then
    perform public.exchange_world_boss_energy(p_event_id, 1, p_exchange_request_id);
    select * into strict v_attack
    from public.attack_world_boss(
      p_event_id, p_species, p_stage, p_attack_type, p_attack_request_id
    );
  else
    select v_existing.id as attack_id,
      v_existing.attempted_damage as attempted_damage,
      v_existing.effective_damage as effective_damage,
      event.remaining_hp as remaining_hp,
      player.light_energy as light_energy,
      v_existing.is_first_hit as is_first_hit,
      v_existing.is_final_hit as is_final_hit
    into strict v_attack
    from public.world_boss_events event
    join public.world_boss_player_states player
      on player.event_id = event.id and player.user_id = v_user_id
    where event.id = p_event_id;
  end if;

  select save.* into strict v_save
  from public.game_saves save where save.user_id = v_user_id;
  v_water := case
    when coalesce(v_save.snapshot #>> '{data,chromatica.waterDrops}', '') ~ '^[0-9]+$'
      then (v_save.snapshot #>> '{data,chromatica.waterDrops}')::bigint else 0 end;

  return query select v_attack.attack_id, v_attack.attempted_damage,
    v_attack.effective_damage, v_attack.remaining_hp, v_attack.light_energy,
    v_attack.is_first_hit, v_attack.is_final_hit, v_water, v_save.revision,
    v_save.snapshot, v_save.updated_at;
end;
$$;

drop function public.learn_world_boss_skill(text, uuid);
create function public.learn_world_boss_skill(p_species text, p_request_id uuid)
returns table (
  species text,
  skill_name text,
  unlocked_at timestamptz,
  applied_revision bigint,
  water_drops bigint,
  game_save_revision bigint,
  game_save_snapshot jsonb,
  game_save_updated_at timestamptz
)
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

  select save.* into strict v_save
  from public.game_saves save where save.user_id = v_user_id for update;
  select unlock.* into v_existing
  from public.world_boss_skill_unlocks unlock
  where unlock.user_id = v_user_id and unlock.species = p_species;

  if not found then
    if public.world_boss_harvested_stage(v_user_id, p_species) <> 3 then
      raise exception 'harvested third-stage spirit required';
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
        revision = v_revision,
        updated_at = pg_catalog.now()
    where save.user_id = v_user_id
    returning save.* into v_save;
    insert into public.world_boss_skill_unlocks
      (user_id, species, skill_name, request_id, applied_revision)
    values (v_user_id, p_species, v_skill_name, p_request_id, v_revision)
    returning world_boss_skill_unlocks.* into v_existing;
  end if;

  if v_save.revision is distinct from (
    select save.revision from public.game_saves save where save.user_id = v_user_id
  ) then
    select save.* into strict v_save
    from public.game_saves save where save.user_id = v_user_id;
  end if;
  v_water := case
    when coalesce(v_save.snapshot #>> '{data,chromatica.waterDrops}', '') ~ '^[0-9]+$'
      then (v_save.snapshot #>> '{data,chromatica.waterDrops}')::bigint else 0 end;
  return query select v_existing.species, v_existing.skill_name,
    v_existing.unlocked_at, v_existing.applied_revision, v_water,
    v_save.revision, v_save.snapshot, v_save.updated_at;
end;
$$;

revoke all on function public.claim_world_boss_event_start_energy(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.claim_world_boss_event_start_energy(uuid, uuid) to service_role;
revoke all on function public.grant_world_boss_practice_energy_v2(uuid) from public, anon;
grant execute on function public.grant_world_boss_practice_energy_v2(uuid) to authenticated, service_role;
revoke all on function public.get_world_boss_battle_context_v2(integer) from public, anon;
grant execute on function public.get_world_boss_battle_context_v2(integer) to authenticated, service_role;
revoke all on function public.learn_world_boss_skill(text, uuid) from public, anon;
grant execute on function public.learn_world_boss_skill(text, uuid) to authenticated, service_role;
revoke all on function public.exchange_and_attack_world_boss(uuid,text,integer,text,uuid,uuid)
from public, anon;
grant execute on function public.exchange_and_attack_world_boss(uuid,text,integer,text,uuid,uuid)
to authenticated, service_role;

commit;
