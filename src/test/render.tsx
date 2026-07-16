/* 테스트용 렌더 헬퍼 — 페이지 컴포넌트에 필요한 프로바이더(Router + Query)를 감싼다.
   실제 앱(main.tsx)과 동일하게 StrictMode 로 감싸 이중 마운트 버그를 테스트에서 잡는다. */
import { StrictMode, type ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
