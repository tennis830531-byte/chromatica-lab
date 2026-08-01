begin;

create table public.discussion_post_hearts (
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (post_id, user_id)
);

create table public.discussion_comment_hearts (
  comment_id uuid not null references public.discussion_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (comment_id, user_id)
);

create index discussion_post_hearts_user_idx
  on public.discussion_post_hearts (user_id, created_at desc);
create index discussion_comment_hearts_user_idx
  on public.discussion_comment_hearts (user_id, created_at desc);

alter table public.discussion_post_hearts enable row level security;
alter table public.discussion_comment_hearts enable row level security;
revoke all on public.discussion_post_hearts, public.discussion_comment_hearts from public, anon, authenticated;
grant select, insert, delete on public.discussion_post_hearts, public.discussion_comment_hearts to service_role;

drop function public.get_discussion_posts(text,text,integer,integer);
create function public.get_discussion_posts(
  p_mode text default 'hot',
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, author_id uuid, author_display_name text, author_avatar_path text,
  author_avatar_version bigint, author_avatar_url text,
  category text, title text, body text, status text, comment_count integer,
  last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz,
  is_pinned boolean, pinned_at timestamptz, heart_count bigint, is_hearted boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_mode not in ('hot', 'latest', 'category') then raise exception 'invalid-mode' using errcode = '22023'; end if;
  if p_mode = 'category' and p_category not in ('harmonica_hardware', 'harmonica_technique', 'music_sharing', 'app_feedback') then
    raise exception 'invalid-category' using errcode = '22023';
  end if;
  return query
  select p.id, p.author_id,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), 'Google 使用者'),
    null::text, 0::bigint,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')),
    p.category, p.title, p.body, p.status, p.comment_count, p.last_activity_at, p.created_at, p.updated_at,
    p.is_pinned, p.pinned_at,
    (select count(*) from public.discussion_post_hearts h where h.post_id = p.id),
    exists (select 1 from public.discussion_post_hearts h where h.post_id = p.id and h.user_id = auth.uid())
  from public.discussion_posts p
  join auth.users u on u.id = p.author_id
  where p.status = 'published'
    and (p_mode <> 'category' or p.category = p_category)
    and (p_mode <> 'hot' or p.is_pinned or p.last_activity_at >= statement_timestamp() - interval '7 days')
  order by p.is_pinned desc, p.pinned_at desc nulls last,
    case when p_mode = 'hot' then p.comment_count end desc,
    case when p_mode = 'hot' then p.last_activity_at end desc,
    p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

drop function public.get_discussion_post(uuid);
create function public.get_discussion_post(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_display_name text, author_avatar_path text,
  author_avatar_version bigint, author_avatar_url text,
  category text, title text, body text, status text, comment_count integer,
  last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz,
  is_pinned boolean, pinned_at timestamptz, heart_count bigint, is_hearted boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_id,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), 'Google 使用者'),
    null::text, 0::bigint,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')),
    p.category, p.title, p.body, p.status, p.comment_count, p.last_activity_at, p.created_at, p.updated_at,
    p.is_pinned, p.pinned_at,
    (select count(*) from public.discussion_post_hearts h where h.post_id = p.id),
    exists (select 1 from public.discussion_post_hearts h where h.post_id = p.id and h.user_id = auth.uid())
  from public.discussion_posts p
  join auth.users u on u.id = p.author_id
  where auth.uid() is not null and p.id = p_post_id and p.status = 'published';
$$;

drop function public.get_discussion_comments(uuid);
create function public.get_discussion_comments(p_post_id uuid)
returns table (
  id uuid, post_id uuid, author_id uuid, author_display_name text,
  author_avatar_path text, author_avatar_version bigint, author_avatar_url text,
  body text, status text, created_at timestamptz, updated_at timestamptz,
  heart_count bigint, is_hearted boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.post_id, c.author_id,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), 'Google 使用者'),
    null::text, 0::bigint,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')),
    c.body, c.status, c.created_at, c.updated_at,
    (select count(*) from public.discussion_comment_hearts h where h.comment_id = c.id),
    exists (select 1 from public.discussion_comment_hearts h where h.comment_id = c.id and h.user_id = auth.uid())
  from public.discussion_comments c
  join public.discussion_posts p on p.id = c.post_id and p.status = 'published'
  join auth.users u on u.id = c.author_id
  where auth.uid() is not null and c.post_id = p_post_id and c.status = 'published'
  order by c.created_at, c.id;
$$;

create function public.update_discussion_post(
  p_post_id uuid,
  p_category text,
  p_title text,
  p_body text
)
returns public.discussion_posts
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.discussion_posts;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_category not in ('harmonica_hardware', 'harmonica_technique', 'music_sharing', 'app_feedback') then
    raise exception 'invalid-category' using errcode = '22023';
  end if;
  if char_length(v_title) not between 2 and 80 then raise exception 'invalid-title' using errcode = '22023'; end if;
  if char_length(v_body) > 10000 then raise exception 'invalid-body' using errcode = '22023'; end if;
  update public.discussion_posts
  set category = p_category, title = v_title, body = v_body
  where id = p_post_id and author_id = auth.uid() and status = 'published'
  returning * into v_post;
  if not found then raise exception 'not-content-owner' using errcode = '42501'; end if;
  return v_post;
end;
$$;

create function public.toggle_discussion_post_heart(p_post_id uuid)
returns table (hearted boolean, heart_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if not exists (select 1 from public.discussion_posts p where p.id = p_post_id and p.status = 'published') then
    raise exception 'post-not-found' using errcode = 'P0002';
  end if;
  delete from public.discussion_post_hearts where post_id = p_post_id and user_id = auth.uid();
  if found then
    hearted := false;
  else
    insert into public.discussion_post_hearts(post_id, user_id) values (p_post_id, auth.uid()) on conflict do nothing;
    hearted := true;
  end if;
  select count(*) into heart_count from public.discussion_post_hearts where post_id = p_post_id;
  return next;
end;
$$;

create function public.toggle_discussion_comment_heart(p_comment_id uuid)
returns table (hearted boolean, heart_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.discussion_comments c
    join public.discussion_posts p on p.id = c.post_id
    where c.id = p_comment_id and c.status = 'published' and p.status = 'published'
  ) then raise exception 'comment-not-found' using errcode = 'P0002'; end if;
  delete from public.discussion_comment_hearts where comment_id = p_comment_id and user_id = auth.uid();
  if found then
    hearted := false;
  else
    insert into public.discussion_comment_hearts(comment_id, user_id) values (p_comment_id, auth.uid()) on conflict do nothing;
    hearted := true;
  end if;
  select count(*) into heart_count from public.discussion_comment_hearts where comment_id = p_comment_id;
  return next;
end;
$$;

revoke all on function public.get_discussion_posts(text,text,integer,integer) from public, anon;
revoke all on function public.get_discussion_post(uuid) from public, anon;
revoke all on function public.get_discussion_comments(uuid) from public, anon;
revoke all on function public.update_discussion_post(uuid,text,text,text) from public, anon;
revoke all on function public.toggle_discussion_post_heart(uuid) from public, anon;
revoke all on function public.toggle_discussion_comment_heart(uuid) from public, anon;

grant execute on function public.get_discussion_posts(text,text,integer,integer) to authenticated;
grant execute on function public.get_discussion_post(uuid) to authenticated;
grant execute on function public.get_discussion_comments(uuid) to authenticated;
grant execute on function public.update_discussion_post(uuid,text,text,text) to authenticated;
grant execute on function public.toggle_discussion_post_heart(uuid) to authenticated;
grant execute on function public.toggle_discussion_comment_heart(uuid) to authenticated;

commit;
