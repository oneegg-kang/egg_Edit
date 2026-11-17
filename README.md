# egg_Edit

나만의 Playground — 평생 만들고 싶었던 프로그램을 만들어 가는 공간.

PC, 웹, 스마트폰에서 **글 · 그림 · 파일 · 음악**을 모두 동기화하는 나만의 저장소입니다.
설계와 진행 상황은 [docs/PLAN.md](docs/PLAN.md) 를 보세요.

## 처음 실행하기

### 1. Supabase 프로젝트 만들기 (한 번만)

1. https://supabase.com 에 가입하고 **New project** 를 만듭니다.
2. 왼쪽 메뉴 **SQL Editor** 에서 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 내용을 붙여 넣고 **Run** 합니다.
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 둡니다.

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
| `npm run dev` | 개발 서버 실행 (코드를 고치면 바로 반영) |
| `npm test` | 자동 테스트 실행 |
| `npm run lint` | 코드 검사 |
| `npm run build` | 배포용 파일 만들기 (`dist/`) |

## 폴더 구조

```
src/
  data/       데이터 형태(types.ts)와 Supabase 연결(supabaseBackend.ts)
  backup/     백업 / 복원
  auth/       로그인 상태 관리
  pages/      화면
supabase/     데이터베이스 구조 (SQL)
docs/         설계 문서
```

## 백업

앱 홈 화면의 **백업 내려받기** 를 누르면 모든 데이터가 ZIP 파일 하나로 저장됩니다.
Supabase 가 없어져도 이 ZIP 을 풀면 내용을 직접 볼 수 있고, 새 서버에 **백업 복원** 으로 되살릴 수 있습니다.
