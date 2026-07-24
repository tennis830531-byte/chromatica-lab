-- refresh-171: backward-compatible announcement galleries and authenticated comments.

create table public.announcement_images (
  id uuid primary key default extensions.gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  image_path text not null unique,
  image_version bigint not null default 1 check (image_version > 0),
  sort_order integer not null check (sort_order >= 0 and sort_order < 20),
  created_at timestamptz not null default pg_catalog.now(),
  unique (announcement_id, sort_order)
);

insert into public.announcement_images (announcement_id, image_path, image_version, sort_order)
select a.id, a.image_path, greatest(a.image_version, 1), 0
from public.announcements a
where nullif(btrim(a.image_path), '') is not null
on conflict (image_path) do nothing;

create table public.announcement_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  body text not null check (
    char_length(btrim(body)) between 1 and 300
    and body !~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (user_id, request_id)
);

create index announcement_images_announcement_order_idx
  on public.announcement_images (announcement_id, sort_order);
create index announcement_comments_announcement_time_idx
  on public.announcement_comments (announcement_id, created_at, id);
create index announcement_comments_user_idx
  on public.announcement_comments (user_id, created_at desc);

alter table public.announcement_images enable row level security;
alter table public.announcement_comments enable row level security;

create policy "authenticated read published announcement images"
  on public.announcement_images for select to authenticated
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.is_published = true
        and a.published_at <= pg_catalog.now()
    )
  );

create policy "authenticated read published announcement comments"
  on public.announcement_comments for select to authenticated
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.is_published = true
        and a.published_at <= pg_catalog.now()
    )
  );

create policy "joined users create their own announcement comments"
  on public.announcement_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.is_published = true
        and a.published_at <= pg_catalog.now()
    )
    and exists (
      select 1
      from public.leaderboard_profiles lp
      where lp.user_id = auth.uid()
        and lp.is_active = true
        and lp.profile_completed = true
        and lp.consented_at is not null
    )
  );

create policy "authors or admins delete announcement comments"
  on public.announcement_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_app_admin(auth.uid()));

revoke all on public.announcement_images, public.announcement_comments from anon, authenticated;
grant select on public.announcement_images, public.announcement_comments to authenticated;
grant insert, delete on public.announcement_comments to authenticated;
grant select, insert, update, delete on public.announcement_images, public.announcement_comments to service_role;

create or replace function public.get_published_announcements_v2()
returns table (
  id uuid,
  large_topic text,
  title text,
  body text,
  image_path text,
  image_version bigint,
  image_paths text[],
  image_versions bigint[],
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.large_topic,
    a.title,
    a.body,
    a.image_path,
    a.image_version,
    coalesce(
      array_agg(ai.image_path order by ai.sort_order) filter (where ai.id is not null),
      case when nullif(btrim(a.image_path), '') is null then array[]::text[] else array[a.image_path] end
    ),
    coalesce(
      array_agg(ai.image_version order by ai.sort_order) filter (where ai.id is not null),
      case when nullif(btrim(a.image_path), '') is null then array[]::bigint[] else array[greatest(a.image_version, 1)] end
    ),
    a.published_at
  from public.announcements a
  left join public.announcement_images ai on ai.announcement_id = a.id
  where a.is_published = true and a.published_at <= pg_catalog.now()
  group by a.id
  order by a.published_at desc, a.id desc
  limit 100;
$$;

create or replace function public.get_admin_announcement_images(p_announcement_id uuid)
returns table (image_path text, image_version bigint, sort_order integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin(auth.uid()) then raise exception 'admin required'; end if;
  return query
    select ai.image_path, ai.image_version, ai.sort_order
    from public.announcement_images ai
    where ai.announcement_id = p_announcement_id
    order by ai.sort_order;
end;
$$;

create or replace function public.get_announcement_comments(p_announcement_id uuid)
returns table (
  id uuid,
  announcement_id uuid,
  body text,
  created_at timestamptz,
  is_own boolean,
  can_delete boolean,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.announcements a
    where a.id = p_announcement_id
      and a.is_published = true
      and a.published_at <= pg_catalog.now()
  ) then raise exception 'announcement not available'; end if;
  return query
    select
      ac.id,
      ac.announcement_id,
      ac.body,
      ac.created_at,
      ac.user_id = v_user_id,
      ac.user_id = v_user_id or public.is_app_admin(v_user_id),
      lp.display_name,
      lp.custom_avatar_path,
      lp.avatar_version
    from public.announcement_comments ac
    join public.leaderboard_profiles lp on lp.user_id = ac.user_id
    where ac.announcement_id = p_announcement_id
      and lp.is_active = true
      and lp.profile_completed = true
      and lp.consented_at is not null
    order by ac.created_at, ac.id;
end;
$$;

create or replace function public.create_announcement_comment(
  p_announcement_id uuid,
  p_body text,
  p_request_id uuid
)
returns table (
  id uuid,
  announcement_id uuid,
  body text,
  created_at timestamptz,
  is_own boolean,
  can_delete boolean,
  display_name text,
  custom_avatar_path text,
  avatar_version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_comment_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null or char_length(v_body) not between 1 and 300 then raise exception 'invalid comment'; end if;
  if not exists (
    select 1 from public.announcements a
    where a.id = p_announcement_id
      and a.is_published = true
      and a.published_at <= pg_catalog.now()
  ) then raise exception 'announcement not available'; end if;
  if not exists (
    select 1 from public.leaderboard_profiles lp
    where lp.user_id = v_user_id
      and lp.is_active = true
      and lp.profile_completed = true
      and lp.consented_at is not null
  ) then raise exception 'leaderboard public profile required'; end if;

  insert into public.announcement_comments (announcement_id, user_id, request_id, body)
  values (p_announcement_id, v_user_id, p_request_id, v_body)
  on conflict (user_id, request_id) do update
    set body = public.announcement_comments.body
  returning public.announcement_comments.id into v_comment_id;

  return query
    select
      ac.id,
      ac.announcement_id,
      ac.body,
      ac.created_at,
      true,
      true,
      lp.display_name,
      lp.custom_avatar_path,
      lp.avatar_version
    from public.announcement_comments ac
    join public.leaderboard_profiles lp on lp.user_id = ac.user_id
    where ac.id = v_comment_id;
end;
$$;

create or replace function public.delete_announcement_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  delete from public.announcement_comments ac
  where ac.id = p_comment_id
    and (ac.user_id = v_user_id or public.is_app_admin(v_user_id));
  return found;
end;
$$;

create or replace function public.replace_announcement_images_service(
  p_announcement_id uuid,
  p_image_paths text[],
  p_image_versions bigint[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_count integer := coalesce(array_length(p_image_paths, 1), 0);
begin
  if v_role <> 'service_role' then raise exception 'service role required'; end if;
  if not exists (select 1 from public.announcements a where a.id = p_announcement_id) then
    raise exception 'announcement not found';
  end if;
  if v_count > 10 or v_count <> coalesce(array_length(p_image_versions, 1), 0) then
    raise exception 'invalid image set';
  end if;
  if v_count <> (select count(distinct path) from unnest(coalesce(p_image_paths, array[]::text[])) path) then
    raise exception 'duplicate image path';
  end if;

  delete from public.announcement_images ai where ai.announcement_id = p_announcement_id;
  if v_count > 0 then
    for v_index in 1..v_count loop
      if p_image_paths[v_index] !~ '^announcement-[0-9a-f-]+[.]webp$'
        or coalesce(p_image_versions[v_index], 0) <= 0 then
        raise exception 'invalid image metadata';
      end if;
      insert into public.announcement_images (announcement_id, image_path, image_version, sort_order)
      values (p_announcement_id, p_image_paths[v_index], p_image_versions[v_index], v_index - 1);
    end loop;
  end if;

  update public.announcements a
  set image_path = case when v_count = 0 then null else p_image_paths[1] end,
      image_version = case when v_count = 0 then 0 else p_image_versions[1] end,
      updated_at = pg_catalog.now()
  where a.id = p_announcement_id;
  return true;
end;
$$;

create or replace function public.delete_announcement_service(p_announcement_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  delete from public.announcements a where a.id = p_announcement_id;
  return found;
end;
$$;

revoke all on function public.get_published_announcements_v2(),
  public.get_admin_announcement_images(uuid),
  public.get_announcement_comments(uuid),
  public.create_announcement_comment(uuid,text,uuid),
  public.delete_announcement_comment(uuid),
  public.replace_announcement_images_service(uuid,text[],bigint[]),
  public.delete_announcement_service(uuid)
from public, anon;

grant execute on function public.get_published_announcements_v2(),
  public.get_admin_announcement_images(uuid),
  public.get_announcement_comments(uuid),
  public.create_announcement_comment(uuid,text,uuid),
  public.delete_announcement_comment(uuid)
to authenticated;

grant execute on function public.replace_announcement_images_service(uuid,text[],bigint[]),
  public.delete_announcement_service(uuid)
to service_role;
