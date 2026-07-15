# CLAUDE.md

## 프로젝트 개요

AI 면접 준비 서비스의 프론트엔드. Vite 7 / React 18 / TypeScript / pnpm 기반 SPA. 라우팅은 React Router 7(Declarative), 데이터 페칭은 TanStack Query 5.

## 명령어

```bash
pnpm install           # 의존성 설치 (Node 20+, 팀 표준 22)
pnpm dev               # 개발 서버 (5173)
pnpm build             # tsc -b 타입체크 + vite build (CI와 동일)
pnpm lint              # ESLint (pnpm lint:fix = 자동 수정)
pnpm format:check      # Prettier 검사 (pnpm format = 적용)
pnpm preview           # 빌드 결과 미리보기
```

- pnpm 버전은 `package.json`의 `packageManager` 필드로 고정 — `corepack enable` 해두면 자동 일치
- 의존성 postinstall 스크립트는 pnpm이 기본 차단 — 허용 목록은 `pnpm-workspace.yaml`의 `allowBuilds` (현재 esbuild만)

## 작업 규칙

- 코드 변경 후 반드시 `pnpm lint && pnpm format:check && pnpm build` 통과를 확인할 것 (CI와 동일 3단계)
- UI 변경은 브라우저에서 실제 동작을 확인한 뒤 커밋 — PR에 스크린샷을 첨부하면 리뷰가 빨라짐
- 커밋 메시지 타입은 `feat`, `fix`, `chore`, `docs`, `refactor`, `test` 사용

## 기술적 결정사항

- **React Router 7 — Declarative 모드** — import는 `react-router`에서 (`react-router-dom` 아님). 라우트 테이블은 `src/routes.ts`(키 → 경로 매핑)가 단일 원천이고, 화면 이동은 `useNav()` 훅(`src/hooks/useNav.ts`)을 사용
- **TanStack Query + 목 API 레이어** — 화면은 `src/api/hooks.ts`의 useQuery 훅만 사용한다. 데이터 흐름은 `fixtures.ts`(목 데이터) → `client.ts`(fetcher) → `hooks.ts`. **백엔드 연동 시 `client.ts` 본문만 실제 fetch로 교체**하고 화면 코드는 건드리지 않는 것이 원칙
- **백엔드 응답 엔벨로프 계약** — 모든 API는 `{ success: true, data }` / `{ success: false, data: null, error: { code, message, fieldErrors } }` 형태(백엔드 `ApiResponse<T>`). HTTP 상태코드는 바디에 없고 상태줄이 유일 원천, 구분은 비즈니스 `code`(도메인 접두사 + 3자리). `client.ts` 연동 시 이 계약 기준으로 언래핑·에러 처리를 구현할 것
- **Wanted DS 대체 컴포넌트** — 디자인 시스템 원본(_ds 번들)이 없어 `src/components/ds/`에 동일 API로 재구성함 (Button·Badge·Card·Modal·Switch 등 12종). 새 UI는 이 컴포넌트와 `src/styles/tokens.css`의 CSS 변수(`var(--*)`)만 사용하고 **hex 하드코딩 금지** (예외: 카카오 버튼 `#FEE500`/`#191600` 등 명세된 브랜드 고정색)
- **아이콘은 lucide-react 레지스트리** — `src/components/Icon.tsx`의 `ICONS`에 등록 후 kebab-case 이름으로 사용 (`<Icon name="chevron-down" />`). 번들 크기 때문에 네임스페이스 전체 임포트 금지
- **ESLint 10 flat config + react-hooks v7** — React Compiler 계열 규칙이 활성화되어 있음(`set-state-in-effect`, `immutability` 등). effect로 상태를 동기화하지 말고 렌더 시 파생 값이나 이벤트 핸들러로 처리할 것

## 프로젝트 구조

```
src/
  routes.ts            # 라우트 테이블 (키·경로 매핑) — 화면 추가 시 여기부터
  App.tsx              # <Routes> 정의
  styles/              # tokens.css (DS 토큰) + global.css (전역 스타일)
  components/ds/       # Wanted DS 대체 컴포넌트 (범용, 도메인 무관)
  components/          # 공유 프리미티브 (Icon·TopNav·ScoreNum·DocThumb 등)
  api/                 # types → fixtures(목) → client(fetcher) → hooks(useQuery)
  pages/               # 화면 단위 컴포넌트 (라우트 1:1)
```

- 새 화면 추가 절차: `routes.ts`에 키·경로 추가 → `pages/`에 페이지 작성 → `App.tsx`에 Route 등록
- 페이지 전용 하위 컴포넌트는 해당 페이지 파일 안에 두고, 2개 이상 화면에서 쓰이면 `components/`로 승격

## 브랜치 / PR 규칙

- **기본 브랜치는 `develop`** (통합 지점), `main`은 배포 전용
- 작업은 `feature/HBB1-<지라번호>-<영문 요약>` 브랜치 → develop PR (접두사는 전체 단어 `feature/`, `feat/` ❌)
- **PR은 항상 draft로 생성**, 준비되면 ready 전환
- PR 제목은 `<타입>: [HBB1-<지라번호>] <요약>` 형식 (예: `feat: [HBB1-21] 대시보드 화면 구현`) — 지라 키가 제목에 있으면 티켓에 자동 연결
- CI(GitHub Actions)는 main/develop 대상 push·PR에서 lint + format check + typecheck/build 실행
