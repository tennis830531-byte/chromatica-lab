begin;

create table if not exists public.leaderboard_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default false,
  profile_completed boolean not null default false,
  display_name text not null check (char_length(display_name) between 2 and 20),
  custom_avatar_path text,
  avatar_version bigint not null default 0 check (avatar_version >= 0),
  featured_spirit_species text not null default '',
  featured_spirit_name text not null default '',
  featured_spirit_stage smallint not null default 1 check (featured_spirit_stage between 1 and 3),
  practice_cycles bigint not null default 0 check (practice_cycles >= 0),
  current_streak_days integer not null default 0 check (current_streak_days >= 0),
  joined_at timestamptz,
  left_at timestamptz,
  consented_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (not is_active or (profile_completed and consented_at is not null and custom_avatar_path is not null))
);

create table if not exists public.leaderboard_practice_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  completed_cycles smallint not null check (completed_cycles between 1 and 8),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, event_id)
);

create table if not exists public.leaderboard_practice_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_date date not null default current_date,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, practice_date)
);

create index if not exists leaderboard_profiles_practice_rank_idx
  on public.leaderboard_profiles (is_active, practice_cycles desc, joined_at asc, user_id asc);
create index if not exists leaderboard_profiles_streak_rank_idx
  on public.leaderboard_profiles (is_active, current_streak_days desc, joined_at asc, user_id asc);
create index if not exists leaderboard_practice_events_user_time_idx
  on public.leaderboard_practice_events (user_id, created_at desc);

alter table public.leaderboard_profiles enable row level security;
alter table public.leaderboard_practice_events enable row level security;
alter table public.leaderboard_practice_days enable row level security;

drop policy if exists "users read own leaderboard profile" on public.leaderboard_profiles;
create policy "users read own leaderboard profile"
  on public.leaderboard_profiles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users update own leaderboard profile" on public.leaderboard_profiles;
create policy "users update own leaderboard profile"
  on public.leaderboard_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.leaderboard_profiles from anon, authenticated;
revoke all on public.leaderboard_practice_events from anon, authenticated;
revoke all on public.leaderboard_practice_days from anon, authenticated;
grant select, insert, update, delete on public.leaderboard_profiles to service_role;
grant select, insert, update, delete on public.leaderboard_practice_events to service_role;
grant select, insert, update, delete on public.leaderboard_practice_days to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leaderboard-avatars',
  'leaderboard-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own leaderboard avatar" on storage.objects;
drop policy if exists "users update own leaderboard avatar" on storage.objects;

drop policy if exists "users delete own leaderboard avatar" on storage.objects;
create policy "users delete own leaderboard avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'leaderboard-avatars'
    and (storage.foldername(name))[1] = md5(auth.uid()::text)
  );

create or replace function public.get_leaderboard_avatar_prefix()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else md5(auth.uid()::text) end;
$$;

create or replace function public.get_my_leaderboard_membership()
returns table (
  joined boolean,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint,
  featured_spirit_species text,
  featured_spirit_name text,
  featured_spirit_stage smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(lp.is_active and lp.profile_completed and lp.consented_at is not null, false),
    lp.display_name,
    lp.custom_avatar_path,
    lp.avatar_version,
    lp.featured_spirit_species,
    lp.featured_spirit_name,
    lp.featured_spirit_stage
  from (select auth.uid() as user_id) caller
  left join public.leaderboard_profiles lp on lp.user_id = caller.user_id
  where caller.user_id is not null;
$$;

create or replace function public.join_global_leaderboard(
  p_display_name text,
  p_custom_avatar_path text,
  p_consent boolean,
  p_featured_spirit_species text,
  p_featured_spirit_name text,
  p_featured_spirit_stage integer
)
returns table (
  joined boolean,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint,
  featured_spirit_species text,
  featured_spirit_name text,
  featured_spirit_stage smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := left(btrim(coalesce(p_display_name, '')), 20);
  v_avatar_path text := nullif(btrim(coalesce(p_custom_avatar_path, '')), '');
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_consent is distinct from true then raise exception 'public consent required'; end if;
  if char_length(v_display_name) < 2 or v_display_name ~ '[[:cntrl:]]' then raise exception 'invalid display name'; end if;
  if v_avatar_path is null or split_part(v_avatar_path, '/', 1) <> md5(v_user_id::text) then raise exception 'avatar required'; end if;
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'leaderboard-avatars'
      and so.name = v_avatar_path
      and lower(storage.extension(so.name)) = 'webp'
      and coalesce((so.metadata ->> 'size')::bigint, 0) < 307200
      and coalesce(so.metadata ->> 'mimetype', '') = 'image/webp'
  ) then raise exception 'valid uploaded avatar required'; end if;
  insert into public.leaderboard_profiles (
    user_id, is_active, profile_completed, display_name, custom_avatar_path,
    featured_spirit_species, featured_spirit_name, featured_spirit_stage,
    joined_at, left_at, consented_at, updated_at
  ) values (
    v_user_id, true, true, v_display_name, v_avatar_path,
    left(coalesce(p_featured_spirit_species, ''), 80),
    left(coalesce(p_featured_spirit_name, ''), 80),
    greatest(1, least(3, coalesce(p_featured_spirit_stage, 1))),
    pg_catalog.now(), null, pg_catalog.now(), pg_catalog.now()
  )
  on conflict (user_id) do update set
    is_active = true,
    profile_completed = true,
    display_name = excluded.display_name,
    custom_avatar_path = excluded.custom_avatar_path,
    avatar_version = public.leaderboard_profiles.avatar_version + 1,
    featured_spirit_species = excluded.featured_spirit_species,
    featured_spirit_name = excluded.featured_spirit_name,
    featured_spirit_stage = excluded.featured_spirit_stage,
    joined_at = coalesce(public.leaderboard_profiles.joined_at, pg_catalog.now()),
    left_at = null,
    consented_at = pg_catalog.now(),
    updated_at = pg_catalog.now();
  return query
    select lp.is_active and lp.profile_completed, lp.display_name, lp.custom_avatar_path,
      lp.avatar_version, lp.featured_spirit_species, lp.featured_spirit_name, lp.featured_spirit_stage
    from public.leaderboard_profiles lp where lp.user_id = v_user_id;
end;
$$;

create or replace function public.leave_global_leaderboard()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  update public.leaderboard_profiles
  set is_active = false,
      profile_completed = false,
      custom_avatar_path = null,
      featured_spirit_species = '',
      featured_spirit_name = '',
      left_at = pg_catalog.now(),
      consented_at = null,
      updated_at = pg_catalog.now()
  where user_id = v_user_id and is_active = true;
  return found;
end;
$$;

create or replace function public.sync_leaderboard_profile(
  p_featured_spirit_species text,
  p_featured_spirit_name text,
  p_featured_spirit_stage integer
)
returns table (
  joined boolean,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint,
  featured_spirit_species text,
  featured_spirit_name text,
  featured_spirit_stage smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  update public.leaderboard_profiles
  set featured_spirit_species = left(coalesce(p_featured_spirit_species, ''), 80),
      featured_spirit_name = left(coalesce(p_featured_spirit_name, ''), 80),
      featured_spirit_stage = greatest(1, least(3, coalesce(p_featured_spirit_stage, 1))),
      updated_at = pg_catalog.now()
  where user_id = v_user_id and is_active = true and profile_completed = true and consented_at is not null;
  if not found then raise exception 'leaderboard membership required'; end if;
  return query
    select lp.is_active and lp.profile_completed, lp.display_name, lp.custom_avatar_path,
      lp.avatar_version, lp.featured_spirit_species, lp.featured_spirit_name, lp.featured_spirit_stage
    from public.leaderboard_profiles lp where lp.user_id = v_user_id;
end;
$$;

create or replace function public.update_leaderboard_profile(
  p_display_name text,
  p_custom_avatar_path text
)
returns table (
  joined boolean,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint,
  featured_spirit_species text,
  featured_spirit_name text,
  featured_spirit_stage smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := left(btrim(coalesce(p_display_name, '')), 20);
  v_avatar_path text := nullif(btrim(coalesce(p_custom_avatar_path, '')), '');
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if char_length(v_display_name) < 2 or v_display_name ~ '[[:cntrl:]]' then raise exception 'invalid display name'; end if;
  if v_avatar_path is null or split_part(v_avatar_path, '/', 1) <> md5(v_user_id::text) then
    raise exception 'invalid avatar path';
  end if;
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'leaderboard-avatars'
      and so.name = v_avatar_path
      and lower(storage.extension(so.name)) = 'webp'
      and coalesce((so.metadata ->> 'size')::bigint, 0) < 307200
      and coalesce(so.metadata ->> 'mimetype', '') = 'image/webp'
  ) then raise exception 'valid uploaded avatar required'; end if;
  update public.leaderboard_profiles as lp
  set display_name = v_display_name,
      custom_avatar_path = v_avatar_path,
      avatar_version = case
        when lp.custom_avatar_path is distinct from v_avatar_path
        then lp.avatar_version + 1 else lp.avatar_version end,
      updated_at = pg_catalog.now()
  where lp.user_id = v_user_id
    and lp.is_active = true
    and lp.profile_completed = true
    and lp.consented_at is not null;
  if not found then raise exception 'leaderboard membership required'; end if;
  return query
    select lp.is_active and lp.profile_completed, lp.display_name, lp.custom_avatar_path,
      lp.avatar_version, lp.featured_spirit_species, lp.featured_spirit_name, lp.featured_spirit_stage
    from public.leaderboard_profiles lp where lp.user_id = v_user_id;
end;
$$;

create or replace function public.record_leaderboard_practice(
  p_event_id uuid,
  p_completed_cycles integer,
  p_practice_date date,
  p_protected_dates date[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted_count integer := 0;
  v_recent_events integer := 0;
  v_today_cycles integer := 0;
  v_protected_count integer := 0;
  v_server_utc_date date := (pg_catalog.now() at time zone 'UTC')::date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_event_id is null then raise exception 'event id required'; end if;
  if p_completed_cycles is null or p_completed_cycles < 1 or p_completed_cycles > 8 then
    raise exception 'invalid cycle count';
  end if;
  if p_practice_date is null
    or p_practice_date < v_server_utc_date - 1
    or p_practice_date > v_server_utc_date + 1 then
    raise exception 'invalid local practice date';
  end if;
  v_protected_count := coalesce(pg_catalog.cardinality(p_protected_dates), 0);
  if v_protected_count < 1 or v_protected_count > 3660 then
    raise exception 'invalid protected date count';
  end if;
  if (
    select count(distinct protected_date) <> v_protected_count
      or min(protected_date) <> p_practice_date - (v_protected_count - 1)
      or max(protected_date) <> p_practice_date
    from pg_catalog.unnest(p_protected_dates) as protected_date
  ) then
    raise exception 'protected dates must be a contiguous canonical streak ending on the local practice date';
  end if;
  if not exists (
    select 1 from public.leaderboard_profiles
    where user_id = v_user_id and is_active = true and profile_completed = true and consented_at is not null
  ) then
    raise exception 'leaderboard membership required';
  end if;
  if exists (
    select 1 from public.leaderboard_practice_events
    where user_id = v_user_id and event_id = p_event_id
  ) then
    return false;
  end if;
  select count(*) into v_recent_events
  from public.leaderboard_practice_events
  where user_id = v_user_id
    and created_at >= pg_catalog.now() - interval '10 minutes';
  if v_recent_events >= 30 then raise exception 'leaderboard rate limit exceeded'; end if;
  select coalesce(sum(completed_cycles), 0) into v_today_cycles
  from public.leaderboard_practice_events
  where user_id = v_user_id and created_at >= date_trunc('day', pg_catalog.now());
  if v_today_cycles + p_completed_cycles > 500 then raise exception 'daily cycle limit exceeded'; end if;

  insert into public.leaderboard_practice_events (user_id, event_id, completed_cycles, created_at)
  values (v_user_id, p_event_id, p_completed_cycles, pg_catalog.now())
  on conflict (user_id, event_id) do nothing;
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then return false; end if;

  delete from public.leaderboard_practice_days
  where user_id = v_user_id;

  insert into public.leaderboard_practice_days (user_id, practice_date, created_at)
  select v_user_id, protected_date, pg_catalog.now()
  from pg_catalog.unnest(p_protected_dates) as protected_date;

  update public.leaderboard_profiles
  set practice_cycles = practice_cycles + p_completed_cycles,
      current_streak_days = v_protected_count,
      updated_at = pg_catalog.now()
  where user_id = v_user_id and is_active = true and profile_completed = true and consented_at is not null;
  return true;
end;
$$;

create or replace function public.get_global_leaderboard(p_metric text default 'practice')
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
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.leaderboard_profiles
    where user_id = auth.uid() and is_active = true and profile_completed = true and consented_at is not null
  ) then raise exception 'completed leaderboard profile required'; end if;
  return query
  with ranked as (
    select
      row_number() over (
        order by
          case when p_metric = 'streak' then lp.current_streak_days::bigint else lp.practice_cycles end desc,
          lp.joined_at asc,
          lp.user_id asc
      ) as rank_position,
      lp.user_id,
      lp.display_name,
      lp.custom_avatar_path,
      lp.avatar_version,
      lp.featured_spirit_species,
      lp.featured_spirit_name,
      lp.featured_spirit_stage,
      case when p_metric = 'streak' then lp.current_streak_days::bigint else lp.practice_cycles end as score
    from public.leaderboard_profiles lp
    where lp.is_active = true and lp.profile_completed = true and lp.consented_at is not null
  ), selected as (
    select * from ranked where rank_position <= 15
    union all
    select * from ranked where user_id = auth.uid() and rank_position > 15
  )
  select
    selected.rank_position,
    md5(selected.user_id::text) as public_key,
    selected.display_name,
    selected.custom_avatar_path,
    selected.avatar_version,
    selected.featured_spirit_species,
    selected.featured_spirit_name,
    selected.featured_spirit_stage,
    selected.score,
    selected.user_id = auth.uid() as is_current_user
  from selected
  order by selected.rank_position;
end;
$$;

revoke all on function public.get_my_leaderboard_membership() from public, anon;
revoke all on function public.get_leaderboard_avatar_prefix() from public, anon;
revoke all on function public.join_global_leaderboard(text, text, boolean, text, text, integer) from public, anon;
revoke all on function public.leave_global_leaderboard() from public, anon;
revoke all on function public.sync_leaderboard_profile(text, text, integer) from public, anon;
revoke all on function public.update_leaderboard_profile(text, text) from public, anon;
revoke all on function public.record_leaderboard_practice(uuid, integer, date, date[]) from public, anon;
revoke all on function public.get_global_leaderboard(text) from public, anon;

grant execute on function public.get_my_leaderboard_membership() to authenticated;
grant execute on function public.get_leaderboard_avatar_prefix() to authenticated;
grant execute on function public.join_global_leaderboard(text, text, boolean, text, text, integer) to authenticated;
grant execute on function public.leave_global_leaderboard() to authenticated;
grant execute on function public.sync_leaderboard_profile(text, text, integer) to authenticated;
grant execute on function public.update_leaderboard_profile(text, text) to authenticated;
grant execute on function public.record_leaderboard_practice(uuid, integer, date, date[]) to authenticated;
grant execute on function public.get_global_leaderboard(text) to authenticated;

commit;
