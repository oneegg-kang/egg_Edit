-- egg_Edit: 동영상(video) 종류 추가
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행하세요. (0001_init.sql 다음에 한 번만)

alter table public.items drop constraint if exists items_kind_check;
alter table public.items
  add constraint items_kind_check check (kind in ('document', 'image', 'file', 'music', 'video'));
