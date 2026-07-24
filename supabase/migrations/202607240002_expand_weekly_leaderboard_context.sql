begin;

create or replace function public.get_weekly_leaderboard()
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
  is_current_user boolean,
  week_start date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week date := public.taipei_leaderboard_week_start(pg_catalog.now());
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.leaderboard_profiles lp
    where lp.user_id = auth.uid()
      and lp.is_active
      and lp.profile_completed
      and lp.consented_at is not null
  ) then
    raise exception 'completed leaderboard profile required';
  end if;

  return query
  with active_members as (
    select
      lp.user_id,
      lp.joined_at,
      lp.display_name,
      lp.custom_avatar_path,
      lp.avatar_version,
      lp.featured_spirit_species,
      lp.featured_spirit_name,
      lp.featured_spirit_stage
    from public.leaderboard_profiles lp
    where lp.is_active
      and lp.profile_completed
      and lp.consented_at is not null
  ), ranked as (
    select
      pg_catalog.row_number() over (
        order by
          coalesce(ws.completed_cycles, 0::bigint) desc,
          am.joined_at asc,
          am.user_id asc
      ) as rank_position,
      am.user_id,
      am.display_name,
      am.custom_avatar_path,
      am.avatar_version,
      am.featured_spirit_species,
      am.featured_spirit_name,
      am.featured_spirit_stage,
      coalesce(ws.completed_cycles, 0::bigint) as completed_cycles
    from active_members am
    left join public.weekly_leaderboard_scores ws
      on ws.user_id = am.user_id
     and ws.week_start = v_week
  ), current_member as (
    select ranked.rank_position
    from ranked
    where ranked.user_id = auth.uid()
  ), selected as (
    select ranked.*
    from ranked
    cross join current_member
    where ranked.rank_position <= 15
       or ranked.rank_position between
         pg_catalog.greatest(1::bigint, current_member.rank_position - 5)
         and current_member.rank_position + 5
  )
  select
    selected.rank_position,
    pg_catalog.md5(selected.user_id::text),
    selected.display_name,
    selected.custom_avatar_path,
    selected.avatar_version,
    selected.featured_spirit_species,
    selected.featured_spirit_name,
    selected.featured_spirit_stage,
    selected.completed_cycles,
    selected.user_id = auth.uid(),
    v_week
  from selected
  order by selected.rank_position;
end;
$$;

comment on function public.get_weekly_leaderboard() is
  'Returns the top fifteen plus five ranks before and after the authenticated active member for the current Taipei week; zero-score members keep their stable row-number rank.';

revoke all on function public.get_weekly_leaderboard() from public, anon;
grant execute on function public.get_weekly_leaderboard() to authenticated;

commit;
