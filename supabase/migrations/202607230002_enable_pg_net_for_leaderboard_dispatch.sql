begin;

create extension if not exists pg_net
with schema extensions;

comment on extension pg_net is
  'Provides net.http_post for the dormant leaderboard notification dispatcher; scheduling and credentials remain disabled.';

commit;
