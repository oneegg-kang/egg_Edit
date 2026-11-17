-- egg_Edit 초기 데이터베이스 구조
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행하세요.
--
-- 설계 원칙
--   * 모든 콘텐츠(문서, 이미지, 파일, 음악)는 하나의 items 테이블에 kind 로 구분해 저장한다.
--     → 폴더 트리 하나로 모든 종류를 정리할 수 있고, 백업/복원도 테이블 두 개만 다루면 된다.
--   * 큰 바이너리(이미지, 파일, 음악)는 Storage 버킷 'vault' 에, 경로는 items.storage_path 에 둔다.
--   * 표준 PostgreSQL 기능만 사용한다. (Supabase 를 떠나도 그대로 옮길 수 있도록)

create extension if not exists "pgcrypto";

-- ── 폴더 ─────────────────────────────────────────────
create table public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id   uuid references public.folders(id) on delete cascade,  -- null = 최상위
  name        text not null check (length(name) between 1 and 255),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index folders_user_parent_idx on public.folders (user_id, parent_id);

-- ── 콘텐츠 항목 ──────────────────────────────────────
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id     uuid references public.folders(id) on delete set null,  -- null = 최상위
  kind          text not null check (kind in ('document', 'image', 'file', 'music')),
  title         text not null default '',
  -- kind 별 내용
  --   document : { "doc": <편집기 JSON> }
  --   image    : { "canvas": <편집 가능한 그림 데이터> }   (렌더링된 PNG 는 storage_path)
  --   music    : { "url": "https://...", "artist": "...", "note": "..." }  (파일이면 storage_path)
  --   file     : {}                                                        (파일은 storage_path)
  content       jsonb not null default '{}'::jsonb,
  storage_path  text,          -- 'vault' 버킷 안의 경로: <user_id>/<item_id>/<파일명>
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index items_user_folder_idx on public.items (user_id, folder_id);
create index items_user_kind_idx   on public.items (user_id, kind);

-- ── updated_at 자동 갱신 ─────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger folders_touch before update on public.folders
  for each row execute function public.touch_updated_at();
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ── 보안: 각자 자기 데이터만 ─────────────────────────
alter table public.folders enable row level security;
alter table public.items   enable row level security;

create policy "own folders" on public.folders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on public.items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 실시간 동기화 (다른 기기에서 바뀐 내용 즉시 반영) ──
alter publication supabase_realtime add table public.folders, public.items;

-- ── 파일 저장소 ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

-- 경로의 첫 폴더가 자기 user_id 인 파일만 읽고 쓸 수 있다.
create policy "own files read" on storage.objects
  for select using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects
  for insert with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects
  for update using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects
  for delete using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
