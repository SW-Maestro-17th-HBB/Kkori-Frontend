import { defineConfig } from "orval";

// 백엔드 springdoc 스펙 → src/api/generated (타입 + fetcher + React Query 훅) 자동 생성.
// 사용법: BE 서버(8080)가 떠 있는 상태에서 `pnpm orval` — 스펙 변경 시 이 한 번으로 FE 동기화.
// src/api/generated/ 는 직접 수정 금지 (다음 생성 시 덮어씌워짐).
export default defineConfig({
  api: {
    input: {
      target: "http://localhost:8080/v3/api-docs",
    },
    output: {
      target: "src/api/generated",
      mode: "tags-split",
      client: "react-query",
      // axios 호환 설정 객체 시그니처로 mutator 를 호출하게 한다 — 실제 axios 의존성은 없음
      httpClient: "axios",
      prettier: true,
      override: {
        mutator: {
          // 전송은 프로젝트 공통 request() 레이어를 쓴다 — 토큰 부착·재발급·에러 변환 재사용
          path: "src/api/orvalMutator.ts",
          name: "customInstance",
        },
      },
    },
  },
});
