begin;

revoke execute on function public.ensure_world_boss_event(timestamptz)
from public, anon, authenticated;

revoke execute on function public.initialize_world_boss_player(uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.world_boss_harvested_stage(uuid, text)
from public, anon, authenticated;

revoke execute on function public.world_boss_owned_stage(uuid, text)
from public, anon, authenticated;

grant execute on function public.ensure_world_boss_event(timestamptz)
to service_role;

grant execute on function public.initialize_world_boss_player(uuid, uuid)
to service_role;

grant execute on function public.world_boss_harvested_stage(uuid, text)
to service_role;

grant execute on function public.world_boss_owned_stage(uuid, text)
to service_role;

commit;
