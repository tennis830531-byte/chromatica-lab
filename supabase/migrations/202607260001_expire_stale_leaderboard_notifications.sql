begin;

update public.leaderboard_notification_queue q
set status = 'skipped',
    processed_at = pg_catalog.now(),
    last_error_code = 'expired'
where (
    q.status in ('pending', 'retry')
    or (
      q.status = 'processing'
      and q.processed_at <= pg_catalog.now() - interval '10 minutes'
    )
  )
  and (
    (
      q.notification_type in ('entered_top_ten', 'rank_improved', 'dropped_out_of_top_ten')
      and q.created_at <= pg_catalog.now() - interval '24 hours'
    )
    or (
      q.notification_type = 'weekly_top_ten_result'
      and q.created_at <= pg_catalog.now() - interval '72 hours'
    )
  );

create or replace function public.claim_leaderboard_notification_queue(p_limit integer default 20)
returns table (
  id uuid,
  week_start date,
  user_id uuid,
  notification_type text,
  rank integer,
  transition_sequence integer,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leaderboard_notification_queue q
  set status = 'skipped',
      processed_at = pg_catalog.now(),
      last_error_code = 'expired'
  where (
      q.status in ('pending', 'retry')
      or (
        q.status = 'processing'
        and q.processed_at <= pg_catalog.now() - interval '10 minutes'
      )
    )
    and (
      (
        q.notification_type in ('entered_top_ten', 'rank_improved', 'dropped_out_of_top_ten')
        and q.created_at <= pg_catalog.now() - interval '24 hours'
      )
      or (
        q.notification_type = 'weekly_top_ten_result'
        and q.created_at <= pg_catalog.now() - interval '72 hours'
      )
    );

  return query
  with candidates as (
    select q.id
    from public.leaderboard_notification_queue q
    where (
        (
          q.status in ('pending', 'retry')
          and q.next_attempt_at <= pg_catalog.now()
        )
        or (
          q.status = 'processing'
          and q.processed_at <= pg_catalog.now() - interval '10 minutes'
        )
      )
      and q.attempts < 5
      and (
        (
          q.notification_type in ('entered_top_ten', 'rank_improved', 'dropped_out_of_top_ten')
          and q.created_at > pg_catalog.now() - interval '24 hours'
        )
        or (
          q.notification_type = 'weekly_top_ten_result'
          and q.created_at > pg_catalog.now() - interval '72 hours'
        )
      )
    order by q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.leaderboard_notification_queue q
  set status = 'processing',
      attempts = q.attempts + 1,
      processed_at = pg_catalog.now()
  from candidates c
  where q.id = c.id
  returning q.id,
    q.week_start,
    q.user_id,
    q.notification_type,
    q.rank,
    q.transition_sequence,
    q.attempts;
end;
$$;

revoke all on function public.claim_leaderboard_notification_queue(integer) from public, anon, authenticated;
grant execute on function public.claim_leaderboard_notification_queue(integer) to service_role;

commit;
