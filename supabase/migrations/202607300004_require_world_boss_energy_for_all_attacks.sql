-- Every successful World Boss attack consumes exactly one light energy.
-- Forward-only correction for the already deployed attack RPC.

create or replace function public.attack_world_boss(
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
  if p_attack_type not in ('normal', 'special') then raise exception 'invalid attack type'; end if;
  if public.world_boss_owned_stage(v_user_id, p_species) < p_stage then
    raise exception 'spirit stage not owned';
  end if;
  perform public.initialize_world_boss_player(p_event_id, v_user_id);
  select player.* into strict v_player from public.world_boss_player_states player
  where player.event_id = p_event_id and player.user_id = v_user_id for update;
  if v_player.light_energy < 1 then raise exception 'insufficient light energy'; end if;
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
    v_attempted := 100;
  else
    v_attempted := case p_stage when 1 then 10 when 2 then 30 when 3 then 60 end;
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
  set light_energy = player.light_energy - 1,
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
    v_attempted, v_effective, 1, v_first, v_final
  ) returning world_boss_attacks.* into v_existing;
  if v_final then
    perform public.settle_world_boss_event(p_event_id, pg_catalog.now());
  end if;
  return query select v_existing.id, v_attempted, v_effective, v_event.remaining_hp,
    v_player.light_energy, v_first, v_final;
end;
$$;

create or replace function public.exchange_and_attack_world_boss(
  p_event_id uuid,
  p_species text,
  p_stage integer,
  p_attack_type text,
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
    p_event_id, p_species, p_stage, p_attack_type, p_attack_request_id
  ) result;
end;
$$;

create or replace function public.track_world_boss_attack_phase_two()
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

  if new.attack_type = 'special' then
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

revoke all on function public.exchange_and_attack_world_boss(uuid,text,integer,text,uuid,uuid)
from public, anon;
grant execute on function public.exchange_and_attack_world_boss(uuid,text,integer,text,uuid,uuid)
to authenticated;
