/* 테스트용 렌더 헬퍼 — 페이지 컴포넌트에 필요한 프로바이더(Router + Query)를 감싼다.
   실제 앱(main.tsx)과 동일하게 StrictMode 로 감싸 이중 마운트 버그를 테스트에서 잡는다. */
import { StrictMode, type ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface Options {
  /** 초기 경로 — location.state 가 필요한 테스트는 객체 형태로 전달 */
  route?: string | { pathname: string; search?: string; state?: unknown };
  /** 캐시를 시드·검증할 테스트가 자기 인스턴스를 주입한다 (기본: 매 렌더 새로 생성) */
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, { route = "/", queryClient }: Options = {}) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return {
    ...render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    ),
    queryClient: client,
  };
}
