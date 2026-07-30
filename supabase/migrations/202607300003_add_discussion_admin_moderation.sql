-- refresh-175 Discussion moderation.
-- public.app_admins remains the single source of administrator authority.

alter table public.discussion_posts
  add column is_pinned boolean not null default false,
  add column pinned_at timestamptz,
  add column pinned_by uuid references auth.users(id),
  add column deleted_by uuid references auth.users(id),
  add column moderation_reason text;

alter table public.discussion_comments
  add column deleted_by uuid references auth.users(id),
  add column moderation_reason text;

alter table public.discussion_posts
  add constraint discussion_posts_pin_state_check
  check (
    (is_pinned and pinned_at is not null and pinned_by is not null)
    or
    (not is_pinned and pinned_at is null and pinned_by is null)
  ),
  add constraint discussion_posts_moderation_reason_check
  check (moderation_reason is null or char_length(btrim(moderation_reason)) between 1 and 500);

alter table public.discussion_comments
  add constraint discussion_comments_moderation_reason_check
  check (moderation_reason is null or char_length(btrim(moderation_reason)) between 1 and 500);

create index discussion_posts_pinned_idx
  on public.discussion_posts (pinned_at desc, created_at desc, id desc)
  where status = 'published' and is_pinned;

create index discussion_posts_deleted_by_idx
  on public.discussion_posts (deleted_by, deleted_at desc)
  where deleted_by is not null;

create index discussion_comments_deleted_by_idx
  on public.discussion_comments (deleted_by, deleted_at desc)
  where deleted_by is not null;

drop function public.get_discussion_posts(text,text,integer,integer);
create function public.get_discussion_posts(
  p_mode text default 'hot',
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, author_id uuid, author_display_name text, author_avatar_path text, author_avatar_version bigint,
  category text, title text, body text, status text, comment_count integer,
  last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz,
  is_pinned boolean, pinned_at timestamptz
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
    p.category, p.title, p.body, p.status, p.comment_count, p.last_activity_at, p.created_at, p.updated_at,
    p.is_pinned, p.pinned_at
  from public.discussion_posts p
  left join public.leaderboard_profiles lp on lp.user_id = p.author_id
  where p.status = 'published'
    and (p_mode <> 'category' or p.category = p_category)
    and (p_mode <> 'hot' or p.is_pinned or p.last_activity_at >= statement_timestamp() - interval '7 days')
  order by
    p.is_pinned desc,
    p.pinned_at desc nulls last,
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
  id uuid, author_id uuid, author_display_name text, author_avatar_path text, author_avatar_version bigint,
  category text, title text, body text, status text, comment_count integer,
  last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz,
  is_pinned boolean, pinned_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_id, coalesce(lp.display_name, '練習者'), lp.custom_avatar_path, coalesce(lp.avatar_version, 0),
    p.category, p.title, p.body, p.status, p.comment_count, p.last_activity_at, p.created_at, p.updated_at,
    p.is_pinned, p.pinned_at
  from public.discussion_posts p
  left join public.leaderboard_profiles lp on lp.user_id = p.author_id
  where auth.uid() is not null and p.id = p_post_id and p.status = 'published';
$$;

create function public.get_discussion_admin_status()
returns table (is_admin boolean)
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.is_app_admin(auth.uid());
$$;

create function public.set_discussion_post_pinned(
  p_post_id uuid,
  p_is_pinned boolean
)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  update public.discussion_posts
  set is_pinned = p_is_pinned,
      pinned_at = case when p_is_pinned then statement_timestamp() else null end,
      pinned_by = case when p_is_pinned then auth.uid() else null end
  where id = p_post_id
    and status = 'published'
    and is_pinned is distinct from p_is_pinned;
  if found then return true; end if;
  return exists (
    select 1 from public.discussion_posts
    where id = p_post_id and status = 'published' and is_pinned = p_is_pinned
  );
end;
$$;

create function public.admin_delete_discussion_post(
  p_post_id uuid,
  p_reason text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 1 and 500 then
    raise exception 'invalid-moderation-reason' using errcode = '22023';
  end if;
  select status into v_status
  from public.discussion_posts
  where id = p_post_id
  for update;
  if not found then return false; end if;
  if v_status = 'deleted' then return true; end if;

  update public.discussion_posts
  set status = 'deleted', title = '內容已刪除', body = '',
      is_pinned = false, pinned_at = null, pinned_by = null,
      deleted_at = statement_timestamp(), deleted_by = auth.uid(),
      moderation_reason = v_reason
  where id = p_post_id;

  update public.discussion_comments
  set status = 'deleted', body = '內容已刪除', deleted_at = statement_timestamp(),
      deleted_by = auth.uid(), moderation_reason = v_reason
  where post_id = p_post_id and status <> 'deleted';

  with changed as (
    update public.discussion_attachments a
    set upload_status = 'deleted', deleted_at = statement_timestamp()
    where a.upload_status = 'bound'
      and (
        (a.owner_type = 'post' and a.owner_id = p_post_id)
        or
        (a.owner_type = 'comment' and exists (
          select 1 from public.discussion_comments c
          where c.id = a.owner_id and c.post_id = p_post_id
        ))
      )
    returning a.id, a.storage_path
  )
  insert into public.discussion_media_cleanup_queue(attachment_id, storage_path)
  select id, storage_path from changed
  on conflict (attachment_id) do nothing;

  update public.discussion_link_previews lp
  set status = 'deleted'
  where lp.status <> 'deleted'
    and (
      (lp.owner_type = 'post' and lp.owner_id = p_post_id)
      or
      (lp.owner_type = 'comment' and exists (
        select 1 from public.discussion_comments c
        where c.id = lp.owner_id and c.post_id = p_post_id
      ))
    );
  return true;
end;
$$;

create function public.admin_delete_discussion_comment(
  p_comment_id uuid,
  p_reason text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 1 and 500 then
    raise exception 'invalid-moderation-reason' using errcode = '22023';
  end if;
  select status into v_status
  from public.discussion_comments
  where id = p_comment_id
  for update;
  if not found then return false; end if;
  if v_status = 'deleted' then return true; end if;

  update public.discussion_comments
  set status = 'deleted', body = '內容已刪除', deleted_at = statement_timestamp(),
      deleted_by = auth.uid(), moderation_reason = v_reason
  where id = p_comment_id;

  with changed as (
    update public.discussion_attachments
    set upload_status = 'deleted', deleted_at = statement_timestamp()
    where owner_type = 'comment' and owner_id = p_comment_id and upload_status = 'bound'
    returning id, storage_path
  )
  insert into public.discussion_media_cleanup_queue(attachment_id, storage_path)
  select id, storage_path from changed
  on conflict (attachment_id) do nothing;

  update public.discussion_link_previews
  set status = 'deleted'
  where owner_type = 'comment' and owner_id = p_comment_id and status <> 'deleted';
  return true;
end;
$$;

revoke all on function public.get_discussion_posts(text,text,integer,integer) from public, anon;
revoke all on function public.get_discussion_post(uuid) from public, anon;
revoke all on function public.get_discussion_admin_status() from public, anon;
revoke all on function public.set_discussion_post_pinned(uuid,boolean) from public, anon;
revoke all on function public.admin_delete_discussion_post(uuid,text) from public, anon;
revoke all on function public.admin_delete_discussion_comment(uuid,text) from public, anon;

grant execute on function public.get_discussion_posts(text,text,integer,integer) to authenticated;
grant execute on function public.get_discussion_post(uuid) to authenticated;
grant execute on function public.get_discussion_admin_status() to authenticated;
grant execute on function public.set_discussion_post_pinned(uuid,boolean) to authenticated;
grant execute on function public.admin_delete_discussion_post(uuid,text) to authenticated;
grant execute on function public.admin_delete_discussion_comment(uuid,text) to authenticated;
