begin;

insert into public.world_boss_definitions (
  boss_key,
  display_name,
  max_hp,
  normal_asset_path,
  enraged_asset_path,
  defeated_asset_path,
  is_active,
  rotation_order
) values (
  'hill-myna',
  '嘯八哥',
  5000,
  '第二隻boss 嘯八哥.png',
  '第二隻boss 嘯八哥 反擊狀態.png',
  '第二隻boss 嘯八哥 死亡狀態.png',
  true,
  2
);

commit;
