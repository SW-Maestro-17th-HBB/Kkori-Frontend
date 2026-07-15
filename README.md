# 꼬리 잡힌 개발자 — Frontend

개발자를 위한 **AI 음성 모의면접** 웹 서비스의 프론트엔드예요. 이력서를 올리면 AI가 맞춤 질문(꼬리질문 포함)을 만들고, 실시간 음성 면접 후 논리·기술·전달력을 점수화한 리포트를 제공해요.

## 스택

- **Vite 7 · React 18 · TypeScript** (Node 20+ 필요)
- **React Router 7** — Declarative 모드 (`react-router` 패키지)
- **TanStack Query 5** — 데이터 페칭 (현재는 목 데이터)
- 아이콘: `lucide-react` — 사용 아이콘은 `src/components/Icon.tsx` 레지스트리에 등록
- 폰트: Wanted Sans · Pretendard (CDN, `index.html`)

## 실행

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # tsc -b + vite build → dist/
pnpm preview      # 빌드 결과 미리보기
```

패키지 매니저는 **pnpm**이에요 (`packageManager` 필드로 고정, corepack 사용 가능). 빌드 스크립트 허용 목록은 `pnpm-workspace.yaml`의 `allowBuilds`에서 관리해요.

## 구조

```
src/
  routes.ts            # 라우트 테이블 (키·경로 매핑)
  App.tsx              # <Routes> 정의
  styles/tokens.css    # Wanted DS 대체 토큰
  styles/global.css    # 전역 스타일
  components/ds/       # Wanted DS 대체 컴포넌트 (Button·Badge·Card·Modal·Switch 등 12종)
  components/          # 공유 프리미티브 (Icon·TopNav·ScoreNum·DocThumb 등)
  api/                 # fixtures(목 데이터) → client(fetcher) → hooks(useQuery)
  pages/               # 11개 화면 (sample은 ReportDetailPage의 variant)
```

## 라우트

| 경로 | 화면 |
|---|---|
| `/` | 랜딩 |
| `/login` | 로그인 |
| `/signup` | 약관 동의 |
| `/dashboard` | 대시보드 |
| `/resumes` | 이력서 관리 |
| `/setup` | 면접 설정 |
| `/live` | 면접 진행 |
| `/reports` | 리포트 목록 |
| `/reports/:id` | 리포트 상세 |
| `/account` | 마이페이지 |
| `/sample` | 예시 리포트 (로그인 전) |

## 백엔드 연동 포인트

데이터는 전부 `src/api/fixtures.ts`의 목이에요. 화면은 `src/api/hooks.ts`의 useQuery 훅만 사용하므로, **`src/api/client.ts`의 함수 본문을 실제 fetch로 교체**하면 화면 수정 없이 연동돼요.

미연동 항목: 실제 미디어 스트림(면접·설정 화면 self-view/마이크), 면접 타이머, 카카오 OAuth.
