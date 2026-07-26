begin;

create extension if not exists pg_cron;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'chromatica-dispatch-leaderboard-notifications'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'chromatica-dispatch-leaderboard-notifications',
    '*/5 * * * *',
    'select public.dispatch_leaderboard_notification_queue();'
  );
end;
$schedule$;

commit;
