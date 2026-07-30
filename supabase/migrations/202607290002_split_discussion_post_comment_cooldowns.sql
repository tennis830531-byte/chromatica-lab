alter table public.discussion_rate_limits
  add column next_post_allowed_at timestamptz not null default '-infinity'::timestamptz,
  add column next_comment_allowed_at timestamptz not null default '-infinity'::timestamptz;

with reconstructed as (
  select
    r.user_id,
    coalesce((
      select max(p.created_at) + interval '180 seconds'
      from public.discussion_posts p
      where p.author_id = r.user_id
    ), '-infinity'::timestamptz) as next_post_allowed_at,
    coalesce((
      select max(c.created_at) + interval '60 seconds'
      from public.discussion_comments c
      where c.author_id = r.user_id
    ), '-infinity'::timestamptz) as next_comment_allowed_at
  from public.discussion_rate_limits r
)
update public.discussion_rate_limits r
set
  next_post_allowed_at = reconstructed.next_post_allowed_at,
  next_comment_allowed_at = reconstructed.next_comment_allowed_at,
  next_allowed_at = greatest(
    reconstructed.next_post_allowed_at,
    reconstructed.next_comment_allowed_at
  )
from reconstructed
where reconstructed.user_id = r.user_id;

create or replace function public.get_discussion_rate_limit()
returns table (next_allowed_at timestamptz, retry_after_seconds integer)
language sql stable security definer set search_path = '' as $$
  select
    greatest(
      coalesce(r.next_post_allowed_at, '-infinity'::timestamptz),
      coalesce(r.next_comment_allowed_at, '-infinity'::timestamptz)
    ),
    greatest(0, ceil(extract(epoch from (
      greatest(
        coalesce(r.next_post_allowed_at, statement_timestamp()),
        coalesce(r.next_comment_allowed_at, statement_timestamp())
      ) - statement_timestamp()
    )))::integer)
  from (select auth.uid() as user_id) u
  left join public.discussion_rate_limits r on r.user_id = u.user_id
  where u.user_id is not null;
$$;

create function public.get_discussion_rate_limit(p_action text)
returns table (next_allowed_at timestamptz, retry_after_seconds integer)
language sql stable security definer set search_path = '' as $$
  select
    case p_action
      when 'create_post' then coalesce(r.next_post_allowed_at, '-infinity'::timestamptz)
      when 'create_comment' then coalesce(r.next_comment_allowed_at, '-infinity'::timestamptz)
      else '-infinity'::timestamptz
    end,
    greatest(0, ceil(extract(epoch from (
      case p_action
        when 'create_post' then coalesce(r.next_post_allowed_at, statement_timestamp())
        when 'create_comment' then coalesce(r.next_comment_allowed_at, statement_timestamp())
        else statement_timestamp()
      end - statement_timestamp()
    )))::integer)
  from (select auth.uid() as user_id) u
  left join public.discussion_rate_limits r on r.user_id = u.user_id
  where u.user_id is not null;
$$;

create or replace function public.create_discussion_post_service(
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
  select next_post_allowed_at into v_next from public.discussion_rate_limits where user_id = p_user_id for update;
  if v_next > v_now then raise exception 'discussion-cooldown:%', ceil(extract(epoch from (v_next - v_now)))::integer using errcode = 'P0001'; end if;
  insert into public.discussion_turnstile_tokens(token_hash, user_id, action, hostname, verified_at, expires_at)
  values (p_token_hash, p_user_id, p_turnstile_action, p_turnstile_hostname, p_verified_at, p_expires_at)
  on conflict do nothing;
  if not found then raise exception 'turnstile-token-replayed' using errcode = '23505'; end if;
  insert into public.discussion_posts(author_id, category, title, body, last_activity_at)
  values (p_user_id, p_category, p_title, p_body, v_now) returning * into v_post;
  update public.discussion_rate_limits
  set next_post_allowed_at = v_now + interval '180 seconds',
      next_allowed_at = greatest(v_now + interval '180 seconds', next_comment_allowed_at),
      updated_at = v_now
  where user_id = p_user_id;
  return v_post;
end;
$$;

create or replace function public.create_discussion_comment_service(
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
  select next_comment_allowed_at into v_next from public.discussion_rate_limits where user_id = p_user_id for update;
  if v_next > v_now then raise exception 'discussion-cooldown:%', ceil(extract(epoch from (v_next - v_now)))::integer using errcode = 'P0001'; end if;
  insert into public.discussion_turnstile_tokens(token_hash, user_id, action, hostname, verified_at, expires_at)
  values (p_token_hash, p_user_id, p_turnstile_action, p_turnstile_hostname, p_verified_at, p_expires_at)
  on conflict do nothing;
  if not found then raise exception 'turnstile-token-replayed' using errcode = '23505'; end if;
  insert into public.discussion_comments(post_id, author_id, body)
  values (p_post_id, p_user_id, p_body) returning * into v_comment;
  update public.discussion_rate_limits
  set next_comment_allowed_at = v_now + interval '60 seconds',
      next_allowed_at = greatest(next_post_allowed_at, v_now + interval '60 seconds'),
      updated_at = v_now
  where user_id = p_user_id;
  return v_comment;
end;
$$;

revoke all on function public.get_discussion_rate_limit(text) from public, anon;
grant execute on function public.get_discussion_rate_limit(text) to authenticated;
