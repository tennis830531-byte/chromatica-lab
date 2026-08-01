alter table public.leaderboard_push_preferences
  add column if not exists world_boss_notifications boolean not null default true;

create or replace function public.get_world_boss_push_preference()
returns table (enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(preferences.world_boss_notifications, true)
  from (select auth.uid() as user_id) current_account
  left join public.leaderboard_push_preferences preferences
    on preferences.user_id = current_account.user_id
  where current_account.user_id is not null;
$$;

create or replace function public.set_world_boss_push_preference(p_enabled boolean)
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

  insert into public.leaderboard_push_preferences (
    user_id,
    world_boss_notifications,
    updated_at
  ) values (
    v_user_id,
    coalesce(p_enabled, true),
    pg_catalog.now()
  )
  on conflict (user_id) do update
  set world_boss_notifications = excluded.world_boss_notifications,
      updated_at = pg_catalog.now();

  return true;
end;
$$;

revoke all on function public.get_world_boss_push_preference() from public;
revoke all on function public.set_world_boss_push_preference(boolean) from public;
grant execute on function public.get_world_boss_push_preference() to authenticated;
grant execute on function public.set_world_boss_push_preference(boolean) to authenticated;
