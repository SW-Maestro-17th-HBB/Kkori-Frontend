import { QueryClient } from "@tanstack/react-query";

/** 운영 기본 옵션의 단일 원천 — 루트 클라이언트(main.tsx)와 보호 구역의
    세션 전용 클라이언트(App.tsx ProtectedSessionBoundary)가 같은 정책을 쓴다. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
      },
    },
  });
}
