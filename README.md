# egg_Edit

나만의 Playground — 평생 만들고 싶었던 프로그램을 만들어 가는 공간.

PC, 웹, 스마트폰에서 **글 · 그림 · 파일 · 음악**을 모두 동기화하는 나만의 저장소입니다.
설계와 진행 상황은 [docs/PLAN.md](docs/PLAN.md) 를 보세요.

## 처음 실행하기

### 1. Supabase 프로젝트 만들기 (한 번만)

1. https://supabase.com 에 가입하고 **New project** 를 만듭니다.
2. 왼쪽 메뉴 **SQL Editor** 에서 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 내용을 붙여 넣고 **Run** 합니다.
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 둡니다.

**업데이트할 때 추가로 실행할 SQL** (이미 실행한 것은 다시 하지 않아도 됩니다)

| 파일 | 내용 |
|---|---|
| [`supabase/migrations/0002_video.sql`](supabase/migrations/0002_video.sql) | 🎬 동영상 기능 |

### 2. 내 컴퓨터에서 실행하기

[Node.js](https://nodejs.org) (22 이상) 가 필요합니다.

```bash
npm install
cp .env.example .env     # 그리고 .env 에 URL 과 키를 붙여 넣기
npm run dev
```

브라우저에서 표시된 주소(보통 http://localhost:5173)를 엽니다.

## 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 (코드를 고치면 바로 반영). 주소 끝에 `?demo` 를 붙이면 로그인 없이 메모리 데이터로 시험 |
| `npm test` | 자동 테스트 실행 |
| `npm run lint` | 코드 검사 |
| `npm run build` | 배포용 파일 만들기 (`dist/`) |

## 폴더 구조

```
src/
  data/       데이터 형태(types.ts), Supabase 연결(supabaseBackend.ts),
              여러 단계 동작(vault.ts), 테스트/데모용 메모리 저장소(memoryBackend.ts)
  backup/     백업 / 복원
  auth/       로그인 상태 관리
  lib/        Supabase 접속, 주소(#/...) 기반 화면 전환
  pages/      화면
supabase/     데이터베이스 구조 (SQL)
docs/         설계 문서
```

## 유튜브 검색 켜기 (선택)

음악·동영상 화면의 **🔍 유튜브 검색** 은 Google 의 YouTube Data API 키가 있어야 동작합니다. (무료, 하루 약 100번 검색)

1. https://console.cloud.google.com 에서 프로젝트를 하나 만듭니다.
2. **API 및 서비스 → 라이브러리** 에서 `YouTube Data API v3` 를 찾아 **사용** 을 누릅니다.
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키** 로 키를 만듭니다.
4. 만든 키를 눌러 **제한** 을 겁니다. (키가 웹페이지에 보이므로 꼭 필요합니다)
   - 애플리케이션 제한: **웹사이트** → `https://oneegg-kang.github.io/*` (내 컴퓨터에서도 쓰려면 `http://localhost:5173/*` 추가)
   - API 제한: **YouTube Data API v3** 만
5. GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables** 탭에서 **New repository variable**:
   이름 `YOUTUBE_API_KEY`, 값에 키를 붙여 넣습니다.
6. **Actions** 탭에서 Deploy 를 다시 실행하거나, 새로 코드를 올리면 반영됩니다.

## 백업

앱 홈 화면의 **백업 내려받기** 를 누르면 모든 데이터가 ZIP 파일 하나로 저장됩니다.
Supabase 가 없어져도 이 ZIP 을 풀면 내용을 직접 볼 수 있고 (문서는 `documents/` 안의 HTML 을 더블클릭), 새 서버에 **백업 복원** 으로 되살릴 수 있습니다.
