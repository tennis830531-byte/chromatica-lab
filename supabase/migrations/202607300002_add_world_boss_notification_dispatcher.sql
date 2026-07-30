begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_world_boss_notification_queue()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_url text;
  v_cron_secret text;
begin
  select secret.decrypted_secret
  into v_function_url
  from vault.decrypted_secrets secret
  where secret.name = 'world_boss_notification_function_url'
  order by secret.created_at desc
  limit 1;

  select secret.decrypted_secret
  into v_cron_secret
  from vault.decrypted_secrets secret
  where secret.name = 'world_boss_notification_cron_secret'
  order by secret.created_at desc
  limit 1;

  if nullif(pg_catalog.btrim(v_function_url), '') is null
    or nullif(pg_catalog.btrim(v_cron_secret), '') is null then
    return false;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.dispatch_world_boss_notification_queue()
from public, anon, authenticated;
grant execute on function public.dispatch_world_boss_notification_queue()
to service_role;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job job
    where job.jobname in (
      'chromatica-world-boss-lifecycle',
      'chromatica-dispatch-world-boss-notifications'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'chromatica-world-boss-lifecycle',
    '*/5 * * * *',
    'select public.run_world_boss_lifecycle();'
  );

  perform cron.schedule(
    'chromatica-dispatch-world-boss-notifications',
    '*/5 * * * *',
    'select public.dispatch_world_boss_notification_queue();'
  );
end;
$schedule$;

commit;
