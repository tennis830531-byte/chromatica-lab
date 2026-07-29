-- refresh-175 discussion board Phase 2: private media drafts and safe link previews.

alter table public.discussion_attachments
  alter column owner_id drop not null,
  add column draft_id uuid,
  add column original_filename text not null default '',
  add column upload_status text not null default 'temporary',
  add column updated_at timestamptz not null default now(),
  add column bound_at timestamptz,
  add column deleted_at timestamptz;

alter table public.discussion_attachments
  add constraint discussion_attachments_upload_status_check
    check (upload_status in ('temporary', 'uploaded', 'bound', 'failed', 'deleted')),
  add constraint discussion_attachments_draft_required_check
    check (draft_id is not null),
  add constraint discussion_attachments_owner_binding_check
    check (
      (upload_status in ('temporary', 'uploaded', 'failed') and owner_id is null and bound_at is null)
      or (upload_status = 'bound' and owner_id is not null and bound_at is not null)
      or upload_status = 'deleted'
    ),
  add constraint discussion_attachments_media_limits_check
    check (
      (media_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') and size_bytes <= 10485760)
      or (media_type = 'video' and mime_type in ('video/mp4', 'video/webm') and size_bytes <= 104857600)
    ),
  add constraint discussion_attachments_private_storage_path_check
    check (storage_path ~ ('^discussion/' || uploader_id::text || '/' || draft_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$'));

alter table public.discussion_attachments
  drop constraint discussion_attachments_owner_type_owner_id_sort_order_key;

create unique index discussion_attachments_bound_sort_idx
  on public.discussion_attachments(owner_type, owner_id, sort_order)
  where upload_status = 'bound';
create index discussion_attachments_draft_idx
  on public.discussion_attachments(uploader_id, draft_id, upload_status, sort_order);
create index discussion_attachments_cleanup_idx
  on public.discussion_attachments(upload_status, created_at)
  where upload_status in ('temporary', 'uploaded', 'failed');

create trigger discussion_attachments_set_updated_at
before update on public.discussion_attachments
for each row execute function public.discussion_set_updated_at();

alter table public.discussion_link_previews
  add column site_name text,
  add column fetched_at timestamptz,
  add column expires_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table public.discussion_link_previews
  add constraint discussion_link_previews_url_scheme_check
    check (normalized_url ~ '^https?://'),
  add constraint discussion_link_previews_provider_embed_check
    check (embed_url is null or (provider = 'youtube' and embed_url ~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}$'));

create unique index discussion_link_previews_owner_url_idx
  on public.discussion_link_previews(owner_type, owner_id, normalized_url)
  where status <> 'deleted';
create index discussion_link_previews_cache_idx
  on public.discussion_link_previews(normalized_url, expires_at)
  where status = 'ready';

create trigger discussion_link_previews_set_updated_at
before update on public.discussion_link_previews
for each row execute function public.discussion_set_updated_at();

create table public.discussion_link_metadata_cache (
  cache_key text primary key check (cache_key ~ '^https?://'),
  normalized_url text not null check (normalized_url ~ '^https?://'),
  provider text,
  site_name text,
  title text,
  description text,
  thumbnail_url text,
  embed_url text,
  status text not null default 'ready' check (status in ('ready', 'failed')),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint discussion_link_metadata_cache_embed_check
    check (embed_url is null or (provider = 'youtube' and embed_url ~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}$'))
);
create index discussion_link_metadata_cache_expiry_idx
  on public.discussion_link_metadata_cache(expires_at);
create trigger discussion_link_metadata_cache_set_updated_at
before update on public.discussion_link_metadata_cache
for each row execute function public.discussion_set_updated_at();
alter table public.discussion_link_metadata_cache enable row level security;
revoke all on public.discussion_link_metadata_cache from public, anon, authenticated;
grant select, insert, update, delete on public.discussion_link_metadata_cache to service_role;

create table public.discussion_media_cleanup_queue (
  attachment_id uuid primary key references public.discussion_attachments(id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index discussion_media_cleanup_pending_idx
  on public.discussion_media_cleanup_queue(available_at)
  where status in ('pending', 'failed');
alter table public.discussion_media_cleanup_queue enable row level security;
revoke all on public.discussion_media_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on public.discussion_media_cleanup_queue to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'discussion-media',
  'discussion-media',
  false,
  104857600,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.create_discussion_upload_service(
  p_user_id uuid,
  p_draft_id uuid,
  p_owner_type text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sort_order integer
) returns public.discussion_attachments
language plpgsql security definer set search_path = '' as $$
declare
  v_media_type text;
  v_extension text;
  v_attachment_id uuid := gen_random_uuid();
  v_count integer;
  v_total bigint;
  v_result public.discussion_attachments;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if p_owner_type not in ('post', 'comment') or p_draft_id is null or p_sort_order < 0 then
    raise exception 'invalid-upload-draft' using errcode = '22023';
  end if;
  select x.media_type, x.extension into v_media_type, v_extension
  from (values
    ('image/jpeg','image','jpg'), ('image/png','image','png'), ('image/webp','image','webp'),
    ('image/gif','image','gif'), ('video/mp4','video','mp4'), ('video/webm','video','webm')
  ) as x(mime_type, media_type, extension)
  where x.mime_type = p_mime_type;
  if v_media_type is null then raise exception 'invalid-media-type' using errcode = '22023'; end if;
  if p_size_bytes <= 0
     or (v_media_type = 'image' and p_size_bytes > 10485760)
     or (v_media_type = 'video' and p_size_bytes > 104857600) then
    raise exception 'media-too-large' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_draft_id::text, 0));
  select count(*), coalesce(sum(size_bytes), 0)
  into v_count, v_total
  from public.discussion_attachments
  where uploader_id = p_user_id and draft_id = p_draft_id and upload_status <> 'deleted';
  if v_count >= 10 then raise exception 'attachment-limit' using errcode = '22023'; end if;
  if v_total + p_size_bytes > 209715200 then raise exception 'attachment-total-limit' using errcode = '22023'; end if;
  insert into public.discussion_attachments(
    id, owner_type, uploader_id, draft_id, media_type, storage_path,
    original_filename, mime_type, size_bytes, sort_order
  ) values (
    v_attachment_id, p_owner_type, p_user_id, p_draft_id, v_media_type,
    'discussion/' || p_user_id::text || '/' || p_draft_id::text || '/' || v_attachment_id::text || '.' || v_extension,
    left(coalesce(p_original_filename, ''), 255), p_mime_type, p_size_bytes, p_sort_order
  ) returning * into v_result;
  return v_result;
end;
$$;

create function public.confirm_discussion_upload_service(
  p_user_id uuid, p_attachment_id uuid, p_actual_size_bytes bigint, p_actual_mime_type text
) returns public.discussion_attachments
language plpgsql security definer set search_path = '' as $$
declare v_result public.discussion_attachments;
begin
  update public.discussion_attachments
  set upload_status = case
      when size_bytes = p_actual_size_bytes and mime_type = p_actual_mime_type then 'uploaded'
      else 'failed'
    end
  where id = p_attachment_id and uploader_id = p_user_id and upload_status in ('temporary','failed')
  returning * into v_result;
  if v_result.id is null then raise exception 'attachment-not-found' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

create function public.discussion_bind_draft_attachments(
  p_user_id uuid, p_draft_id uuid, p_owner_type text, p_owner_id uuid, p_attachment_ids uuid[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_expected integer := coalesce(cardinality(p_attachment_ids), 0); v_updated integer; v_total bigint;
begin
  if v_expected > 10 then raise exception 'attachment-limit' using errcode = '22023'; end if;
  if v_expected = 0 then return; end if;
  if v_expected <> (select count(distinct id) from unnest(p_attachment_ids) id) then
    raise exception 'duplicate-attachment' using errcode = '22023';
  end if;
  select coalesce(sum(size_bytes), 0) into v_total
  from public.discussion_attachments
  where id = any(p_attachment_ids) and uploader_id = p_user_id and draft_id = p_draft_id
    and owner_type = p_owner_type and upload_status = 'uploaded';
  if v_total > 209715200 then raise exception 'attachment-total-limit' using errcode = '22023'; end if;
  update public.discussion_attachments a
  set owner_id = p_owner_id, upload_status = 'bound', bound_at = statement_timestamp(),
      sort_order = ids.ordinality - 1
  from unnest(p_attachment_ids) with ordinality ids(id, ordinality)
  where a.id = ids.id and a.uploader_id = p_user_id and a.draft_id = p_draft_id
    and a.owner_type = p_owner_type and a.upload_status = 'uploaded';
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then raise exception 'attachment-validation-failed' using errcode = '22023'; end if;
end;
$$;

create function public.discard_discussion_draft_service(p_user_id uuid, p_draft_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with changed as (
    update public.discussion_attachments
    set upload_status = 'deleted', deleted_at = statement_timestamp()
    where uploader_id = p_user_id and draft_id = p_draft_id
      and owner_id is null and upload_status in ('temporary','uploaded','failed')
    returning id, storage_path
  ), queued as (
    insert into public.discussion_media_cleanup_queue(attachment_id, storage_path)
    select id, storage_path from changed on conflict (attachment_id) do nothing returning 1
  ) select count(*) into v_count from changed;
  return v_count;
end;
$$;

create function public.claim_discussion_media_cleanup_service(
  p_expired_before timestamptz,
  p_limit integer default 100
) returns table(attachment_id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_expired_before is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid-cleanup-request' using errcode = '22023';
  end if;

  with expired as (
    select a.id
    from public.discussion_attachments a
    where a.owner_id is null
      and a.upload_status in ('temporary', 'uploaded', 'failed')
      and a.created_at < p_expired_before
    order by a.created_at, a.id
    for update skip locked
    limit p_limit
  ), changed as (
    update public.discussion_attachments a
    set upload_status = 'deleted', deleted_at = statement_timestamp()
    from expired e
    where a.id = e.id
    returning a.id, a.storage_path
  )
  insert into public.discussion_media_cleanup_queue(attachment_id, storage_path)
  select id, changed.storage_path
  from changed
  on conflict on constraint discussion_media_cleanup_queue_pkey do nothing;

  return query
  with claimable as (
    select q.attachment_id
    from public.discussion_media_cleanup_queue q
    where q.status in ('pending', 'failed')
      and q.available_at <= statement_timestamp()
    order by q.available_at, q.attachment_id
    for update skip locked
    limit p_limit
  )
  update public.discussion_media_cleanup_queue q
  set status = 'processing', attempts = q.attempts + 1
  from claimable c
  where q.attachment_id = c.attachment_id
  returning q.attachment_id, q.storage_path;
end;
$$;

create function public.complete_discussion_media_cleanup_service(
  p_attachment_id uuid,
  p_succeeded boolean
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.discussion_media_cleanup_queue
  set status = case when p_succeeded then 'completed' else 'failed' end,
      completed_at = case when p_succeeded then statement_timestamp() else null end,
      available_at = case when p_succeeded then available_at else statement_timestamp() + interval '15 minutes' end
  where attachment_id = p_attachment_id and status = 'processing';
  return found;
end;
$$;

create function public.get_visible_discussion_attachments_service(p_user_id uuid, p_attachment_ids uuid[])
returns table(id uuid, storage_path text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.storage_path
  from public.discussion_attachments a
  where a.id = any(p_attachment_ids) and a.upload_status = 'bound'
    and (
      (a.owner_type = 'post' and exists (
        select 1 from public.discussion_posts p where p.id = a.owner_id and p.status = 'published'
      ))
      or (a.owner_type = 'comment' and exists (
        select 1 from public.discussion_comments c
        join public.discussion_posts p on p.id = c.post_id
        where c.id = a.owner_id and c.status = 'published' and p.status = 'published'
      ))
    )
    and p_user_id is not null;
$$;

create function public.discussion_bind_link_previews(
  p_owner_type text, p_owner_id uuid, p_previews jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_url text;
  v_cached public.discussion_link_metadata_cache;
begin
  if p_previews is null then return; end if;
  if jsonb_typeof(p_previews) <> 'array' or jsonb_array_length(p_previews) > 5 then
    raise exception 'link-preview-limit' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_previews)
  loop
    v_url := btrim(coalesce(v_item->>'normalized_url', ''));
    if v_url !~ '^https?://' then raise exception 'invalid-preview-url' using errcode = '22023'; end if;
    select c.* into v_cached
    from public.discussion_link_metadata_cache c
    where (c.cache_key = v_url or c.normalized_url = v_url)
      and c.status = 'ready'
      and c.expires_at > statement_timestamp()
    order by c.expires_at desc
    limit 1;
    if not found then continue; end if;
    insert into public.discussion_link_previews(
      owner_type, owner_id, original_url, normalized_url, provider, site_name,
      title, description, thumbnail_url, embed_url, status, fetched_at, expires_at
    ) values (
      p_owner_type, p_owner_id, v_cached.normalized_url, v_cached.normalized_url,
      v_cached.provider, v_cached.site_name, v_cached.title, v_cached.description,
      v_cached.thumbnail_url, v_cached.embed_url, v_cached.status,
      v_cached.fetched_at, v_cached.expires_at
    ) on conflict do nothing;
  end loop;
end;
$$;

create function public.create_discussion_post_with_media_service(
  p_user_id uuid, p_category text, p_title text, p_body text,
  p_token_hash text, p_turnstile_action text, p_turnstile_hostname text,
  p_verified_at timestamptz, p_expires_at timestamptz,
  p_draft_id uuid, p_attachment_ids uuid[], p_link_previews jsonb
) returns public.discussion_posts
language plpgsql security definer set search_path = '' as $$
declare v_post public.discussion_posts;
begin
  v_post := public.create_discussion_post_service(
    p_user_id, p_category, p_title, p_body, p_token_hash, p_turnstile_action,
    p_turnstile_hostname, p_verified_at, p_expires_at
  );
  perform public.discussion_bind_draft_attachments(
    p_user_id, p_draft_id, 'post', v_post.id, coalesce(p_attachment_ids, array[]::uuid[])
  );
  perform public.discussion_bind_link_previews('post', v_post.id, coalesce(p_link_previews, '[]'::jsonb));
  return v_post;
end;
$$;

create function public.create_discussion_comment_with_media_service(
  p_user_id uuid, p_post_id uuid, p_body text,
  p_token_hash text, p_turnstile_action text, p_turnstile_hostname text,
  p_verified_at timestamptz, p_expires_at timestamptz,
  p_draft_id uuid, p_attachment_ids uuid[], p_link_previews jsonb
) returns public.discussion_comments
language plpgsql security definer set search_path = '' as $$
declare v_comment public.discussion_comments;
begin
  v_comment := public.create_discussion_comment_service(
    p_user_id, p_post_id, p_body, p_token_hash, p_turnstile_action,
    p_turnstile_hostname, p_verified_at, p_expires_at
  );
  perform public.discussion_bind_draft_attachments(
    p_user_id, p_draft_id, 'comment', v_comment.id, coalesce(p_attachment_ids, array[]::uuid[])
  );
  perform public.discussion_bind_link_previews('comment', v_comment.id, coalesce(p_link_previews, '[]'::jsonb));
  return v_comment;
end;
$$;

create or replace function public.delete_discussion_post_service(p_user_id uuid, p_post_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.discussion_posts
  set status = 'deleted', title = '內容已刪除', body = '', deleted_at = statement_timestamp()
  where id = p_post_id and author_id = p_user_id and status = 'published';
  if not found then return false; end if;
  with changed as (
    update public.discussion_attachments
    set upload_status = 'deleted', deleted_at = statement_timestamp()
    where owner_type = 'post' and owner_id = p_post_id and upload_status = 'bound'
    returning id, storage_path
  )
  insert into public.discussion_media_cleanup_queue(attachment_id, storage_path)
  select id, storage_path from changed on conflict (attachment_id) do nothing;
  update public.discussion_link_previews set status = 'deleted'
  where owner_type = 'post' and owner_id = p_post_id and status <> 'deleted';
  return true;
end;
$$;

create or replace function public.delete_discussion_comment_service(p_user_id uuid, p_comment_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.discussion_comments
  set status = 'deleted', body = '內容已刪除', deleted_at = statement_timestamp()
  where id = p_comment_id and author_id = p_user_id and status = 'published';
  if not found then return false; end if;
  with changed as (
    update public.discussion_attachments
    set upload_status = 'deleted', deleted_at = statement_timestamp()
    where owner_type = 'comment' and owner_id = p_comment_id and upload_status = 'bound'
    returning id, storage_path
  )
  insert into public.discussion_media_cleanup_queue(attachment_id, storage_path)
  select id, storage_path from changed on conflict (attachment_id) do nothing;
  update public.discussion_link_previews set status = 'deleted'
  where owner_type = 'comment' and owner_id = p_comment_id and status <> 'deleted';
  return true;
end;
$$;

revoke all on function public.create_discussion_upload_service(uuid,uuid,text,text,text,bigint,integer) from public, anon, authenticated;
revoke all on function public.confirm_discussion_upload_service(uuid,uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.discussion_bind_draft_attachments(uuid,uuid,text,uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.discard_discussion_draft_service(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_discussion_media_cleanup_service(timestamptz,integer) from public, anon, authenticated;
revoke all on function public.complete_discussion_media_cleanup_service(uuid,boolean) from public, anon, authenticated;
revoke all on function public.get_visible_discussion_attachments_service(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.create_discussion_upload_service(uuid,uuid,text,text,text,bigint,integer) to service_role;
grant execute on function public.confirm_discussion_upload_service(uuid,uuid,bigint,text) to service_role;
grant execute on function public.discussion_bind_draft_attachments(uuid,uuid,text,uuid,uuid[]) to service_role;
grant execute on function public.discard_discussion_draft_service(uuid,uuid) to service_role;
grant execute on function public.claim_discussion_media_cleanup_service(timestamptz,integer) to service_role;
grant execute on function public.complete_discussion_media_cleanup_service(uuid,boolean) to service_role;
grant execute on function public.get_visible_discussion_attachments_service(uuid,uuid[]) to service_role;
revoke all on function public.discussion_bind_link_previews(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.create_discussion_post_with_media_service(uuid,text,text,text,text,text,text,timestamptz,timestamptz,uuid,uuid[],jsonb) from public, anon, authenticated;
revoke all on function public.create_discussion_comment_with_media_service(uuid,uuid,text,text,text,text,timestamptz,timestamptz,uuid,uuid[],jsonb) from public, anon, authenticated;
grant execute on function public.discussion_bind_link_previews(text,uuid,jsonb) to service_role;
grant execute on function public.create_discussion_post_with_media_service(uuid,text,text,text,text,text,text,timestamptz,timestamptz,uuid,uuid[],jsonb) to service_role;
grant execute on function public.create_discussion_comment_with_media_service(uuid,uuid,text,text,text,text,timestamptz,timestamptz,uuid,uuid[],jsonb) to service_role;
