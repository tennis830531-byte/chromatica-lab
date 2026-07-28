-- refresh-175 discussion board Phase 1.
-- Media and link tables are schema reservations only; no upload or metadata flow is enabled.

create table public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('harmonica_hardware', 'harmonica_technique', 'music_sharing', 'app_feedback')),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  body text not null default '' check (char_length(body) <= 10000),
  status text not null default 'published' check (status in ('published', 'deleted', 'hidden')),
  comment_count integer not null default 0 check (comment_count >= 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((status = 'deleted' and deleted_at is not null) or status <> 'deleted')
);

create table public.discussion_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  status text not null default 'published' check (status in ('published', 'deleted', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((status = 'deleted' and deleted_at is not null) or status <> 'deleted')
);

create table public.discussion_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_allowed_at timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default now()
);

create table public.discussion_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('post', 'comment')),
  owner_id uuid not null,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null check (btrim(storage_path) <> ''),
  mime_type text not null check (btrim(mime_type) <> ''),
  size_bytes bigint not null check (size_bytes >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  unique (owner_type, owner_id, sort_order),
  unique (storage_path)
);

create table public.discussion_link_previews (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('post', 'comment')),
  owner_id uuid not null,
  original_url text not null,
  normalized_url text not null,
  provider text,
  title text,
  description text,
  thumbnail_url text,
  embed_url text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'deleted')),
  created_at timestamptz not null default now()
);

create table public.discussion_turnstile_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('create_post', 'create_comment')),
  hostname text not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  check (expires_at > verified_at)
);

create index discussion_posts_latest_idx on public.discussion_posts (created_at desc, id desc) where status = 'published';
create index discussion_posts_hot_idx on public.discussion_posts (comment_count desc, last_activity_at desc, created_at desc) where status = 'published';
create index discussion_posts_category_latest_idx on public.discussion_posts (category, created_at desc, id desc) where status = 'published';
create index discussion_posts_status_idx on public.discussion_posts (status);
create index discussion_posts_author_idx on public.discussion_posts (author_id, created_at desc);
create index discussion_comments_post_created_idx on public.discussion_comments (post_id, created_at, id) where status = 'published';
create index discussion_comments_status_idx on public.discussion_comments (status);
create index discussion_comments_author_idx on public.discussion_comments (author_id, created_at desc);
create index discussion_attachments_owner_idx on public.discussion_attachments (owner_type, owner_id, sort_order);
create index discussion_attachments_uploader_idx on public.discussion_attachments (uploader_id, created_at desc);
create index discussion_link_previews_owner_idx on public.discussion_link_previews (owner_type, owner_id);
create index discussion_link_previews_normalized_url_idx on public.discussion_link_previews (normalized_url);
create index discussion_turnstile_tokens_expiry_idx on public.discussion_turnstile_tokens (expires_at);

create function public.discussion_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger discussion_posts_set_updated_at
before update on public.discussion_posts
for each row execute function public.discussion_set_updated_at();

create trigger discussion_comments_set_updated_at
before update on public.discussion_comments
for each row execute function public.discussion_set_updated_at();

create function public.discussion_refresh_post_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  update public.discussion_posts p
  set comment_count = (
        select count(*)::integer from public.discussion_comments c
        where c.post_id = v_post_id and c.status = 'published'
      ),
      last_activity_at = greatest(
        p.created_at,
        coalesce((
          select max(c.created_at) from public.discussion_comments c
          where c.post_id = v_post_id and c.status = 'published'
        ), p.created_at)
      )
  where p.id = v_post_id;
  return coalesce(new, old);
end;
$$;

create trigger discussion_comments_refresh_post
after insert or update of status or delete on public.discussion_comments
for each row execute function public.discussion_refresh_post_activity();

alter table public.discussion_posts enable row level security;
alter table public.discussion_comments enable row level security;
alter table public.discussion_rate_limits enable row level security;
alter table public.discussion_attachments enable row level security;
alter table public.discussion_link_previews enable row level security;
alter table public.discussion_turnstile_tokens enable row level security;

create policy "authenticated read published discussion posts"
on public.discussion_posts for select to authenticated
using (status = 'published');

create policy "authenticated read published discussion comments"
on public.discussion_comments for select to authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.discussion_posts p
    where p.id = discussion_comments.post_id and p.status = 'published'
  )
);

revoke all on public.discussion_posts, public.discussion_comments, public.discussion_rate_limits,
  public.discussion_attachments, public.discussion_link_previews, public.discussion_turnstile_tokens
from anon, authenticated;
grant select on public.discussion_posts, public.discussion_comments to authenticated;
grant select, insert, update, delete on public.discussion_posts, public.discussion_comments,
  public.discussion_rate_limits, public.discussion_attachments, public.discussion_link_previews,
  public.discussion_turnstile_tokens
to service_role;

create function public.get_discussion_posts(
  p_mode text default 'hot',
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, author_id uuid, author_display_name text, author_avatar_path text, author_avatar_version bigint,
  category text, title text, body text, status text, comment_count integer,
  last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_mode not in ('hot', 'latest', 'category') then raise exception 'invalid-mode' using errcode = '22023'; end if;
  if p_mode = 'category' and p_category not in ('harmonica_hardware', 'harmonica_technique', 'music_sharing', 'app_feedback') then
    raise exception 'invalid-category' using errcode = '22023';
  end if;
  return query
  select p.id, p.author_id, coalesce(lp.display_name, '練習者'), lp.custom_avatar_path, coalesce(lp.avatar_version, 0),
    p.category, p.title, p.body, p.status, p.comment_count, p.last_activity_at, p.created_at, p.updated_at
  from public.discussion_posts p
  left join public.leaderboard_profiles lp on lp.user_id = p.author_id
  where p.status = 'published'
    and (p_mode <> 'category' or p.category = p_category)
    and (p_mode <> 'hot' or p.last_activity_at >= statement_timestamp() - interval '7 days')
  order by
    case when p_mode = 'hot' then p.comment_count end desc,
    case when p_mode = 'hot' then p.last_activity_at end desc,
    p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

create function public.get_discussion_post(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_display_name text, author_avatar_path text, author_avatar_version bigint,
  category text, title text, body text, status text, comment_count integer,
  last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_id, coalesce(lp.display_name, '練習者'), lp.custom_avatar_path, coalesce(lp.avatar_version, 0),
    p.category, p.title, p.body, p.status, p.comment_count, p.last_activity_at, p.created_at, p.updated_at
  from public.discussion_posts p
  left join public.leaderboard_profiles lp on lp.user_id = p.author_id
  where auth.uid() is not null and p.id = p_post_id and p.status = 'published';
$$;

create function public.get_discussion_comments(p_post_id uuid)
returns table (
  id uuid, post_id uuid, author_id uuid, author_display_name text, author_avatar_path text, author_avatar_version bigint,
  body text, status text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.post_id, c.author_id, coalesce(lp.display_name, '練習者'), lp.custom_avatar_path, coalesce(lp.avatar_version, 0),
    c.body, c.status, c.created_at, c.updated_at
  from public.discussion_comments c
  join public.discussion_posts p on p.id = c.post_id and p.status = 'published'
  left join public.leaderboard_profiles lp on lp.user_id = c.author_id
  where auth.uid() is not null and c.post_id = p_post_id and c.status = 'published'
  order by c.created_at, c.id;
$$;

create function public.get_discussion_rate_limit()
returns table (next_allowed_at timestamptz, retry_after_seconds integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(r.next_allowed_at, '-infinity'::timestamptz),
    greatest(0, ceil(extract(epoch from (coalesce(r.next_allowed_at, statement_timestamp()) - statement_timestamp())))::integer)
  from (select auth.uid() as user_id) u
  left join public.discussion_rate_limits r on r.user_id = u.user_id
  where u.user_id is not null;
$$;

create function public.create_discussion_post_service(
  p_user_id uuid, p_category text, p_title text, p_body text,
  p_token_hash text, p_turnstile_action text, p_turnstile_hostname text,
  p_verified_at timestamptz, p_expires_at timestamptz
) returns public.discussion_posts
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_next timestamptz;
  v_post public.discussion_posts;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then raise exception 'authentication-required' using errcode = '42501'; end if;
  p_category := btrim(coalesce(p_category, '')); p_title := btrim(coalesce(p_title, '')); p_body := btrim(coalesce(p_body, ''));
  if p_category not in ('harmonica_hardware', 'harmonica_technique', 'music_sharing', 'app_feedback') then raise exception 'invalid-category' using errcode = '22023'; end if;
  if char_length(p_title) not between 2 and 80 then raise exception 'invalid-title' using errcode = '22023'; end if;
  if char_length(p_body) > 10000 then raise exception 'invalid-body' using errcode = '22023'; end if;
  if p_turnstile_action <> 'create_post' or p_verified_at > v_now + interval '1 minute' or p_expires_at <= v_now then raise exception 'turnstile-invalid' using errcode = '22023'; end if;
  insert into public.discussion_rate_limits(user_id) values (p_user_id) on conflict do nothing;
  select next_allowed_at into v_next from public.discussion_rate_limits where user_id = p_user_id for update;
  if v_next > v_now then raise exception 'discussion-cooldown:%', ceil(extract(epoch from (v_next - v_now)))::integer using errcode = 'P0001'; end if;
  insert into public.discussion_turnstile_tokens(token_hash, user_id, action, hostname, verified_at, expires_at)
  values (p_token_hash, p_user_id, p_turnstile_action, p_turnstile_hostname, p_verified_at, p_expires_at)
  on conflict do nothing;
  if not found then raise exception 'turnstile-token-replayed' using errcode = '23505'; end if;
  insert into public.discussion_posts(author_id, category, title, body, last_activity_at)
  values (p_user_id, p_category, p_title, p_body, v_now) returning * into v_post;
  update public.discussion_rate_limits set next_allowed_at = v_now + interval '180 seconds', updated_at = v_now where user_id = p_user_id;
  return v_post;
end;
$$;

create function public.create_discussion_comment_service(
  p_user_id uuid, p_post_id uuid, p_body text,
  p_token_hash text, p_turnstile_action text, p_turnstile_hostname text,
  p_verified_at timestamptz, p_expires_at timestamptz
) returns public.discussion_comments
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_next timestamptz;
  v_comment public.discussion_comments;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then raise exception 'authentication-required' using errcode = '42501'; end if;
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) not between 1 and 3000 then raise exception 'invalid-comment' using errcode = '22023'; end if;
  if not exists (select 1 from public.discussion_posts where id = p_post_id and status = 'published') then raise exception 'post-not-found' using errcode = 'P0002'; end if;
  if p_turnstile_action <> 'create_comment' or p_verified_at > v_now + interval '1 minute' or p_expires_at <= v_now then raise exception 'turnstile-invalid' using errcode = '22023'; end if;
  insert into public.discussion_rate_limits(user_id) values (p_user_id) on conflict do nothing;
  select next_allowed_at into v_next from public.discussion_rate_limits where user_id = p_user_id for update;
  if v_next > v_now then raise exception 'discussion-cooldown:%', ceil(extract(epoch from (v_next - v_now)))::integer using errcode = 'P0001'; end if;
  insert into public.discussion_turnstile_tokens(token_hash, user_id, action, hostname, verified_at, expires_at)
  values (p_token_hash, p_user_id, p_turnstile_action, p_turnstile_hostname, p_verified_at, p_expires_at)
  on conflict do nothing;
  if not found then raise exception 'turnstile-token-replayed' using errcode = '23505'; end if;
  insert into public.discussion_comments(post_id, author_id, body)
  values (p_post_id, p_user_id, p_body) returning * into v_comment;
  update public.discussion_rate_limits set next_allowed_at = v_now + interval '180 seconds', updated_at = v_now where user_id = p_user_id;
  return v_comment;
end;
$$;

create function public.delete_discussion_post_service(p_user_id uuid, p_post_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.discussion_posts
  set status = 'deleted', title = '內容已刪除', body = '', deleted_at = statement_timestamp()
  where id = p_post_id and author_id = p_user_id and status = 'published';
  return found;
end;
$$;

create function public.delete_discussion_comment_service(p_user_id uuid, p_comment_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.discussion_comments
  set status = 'deleted', body = '內容已刪除', deleted_at = statement_timestamp()
  where id = p_comment_id and author_id = p_user_id and status = 'published';
  return found;
end;
$$;

revoke all on function public.create_discussion_post_service(uuid,text,text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.create_discussion_comment_service(uuid,uuid,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.delete_discussion_post_service(uuid,uuid) from public, anon, authenticated;
revoke all on function public.delete_discussion_comment_service(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_discussion_post_service(uuid,text,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.create_discussion_comment_service(uuid,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.delete_discussion_post_service(uuid,uuid) to service_role;
grant execute on function public.delete_discussion_comment_service(uuid,uuid) to service_role;

revoke all on function public.get_discussion_posts(text,text,integer,integer) from public, anon;
revoke all on function public.get_discussion_post(uuid) from public, anon;
revoke all on function public.get_discussion_comments(uuid) from public, anon;
revoke all on function public.get_discussion_rate_limit() from public, anon;
grant execute on function public.get_discussion_posts(text,text,integer,integer) to authenticated;
grant execute on function public.get_discussion_post(uuid) to authenticated;
grant execute on function public.get_discussion_comments(uuid) to authenticated;
grant execute on function public.get_discussion_rate_limit() to authenticated;
