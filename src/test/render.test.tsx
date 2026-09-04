/* renderWithProviders 계약 테스트 — 헬퍼 변경으로 이를 쓰는 테스트들이 조용히
   약해지는 것을 막는다 (route 객체 전달, queryClient 주입, 기본 retry 비활성). */
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { useLocation } from "react-router";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "./render";

function LocationProbe() {
  const loc = useLocation();
  return (
    <>
      <div data-testid="pathname">{loc.pathname}</div>
      <div data-testid="search">{loc.search}</div>
      <div data-testid="state">{JSON.stringify(loc.state)}</div>
    </>
  );
}

function ClientProbe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => {
    onClient(client);
  }, [client, onClient]);
  return null;
}

describe("renderWithProviders", () => {
  it("route 객체의 pathname·search·state 가 useLocation 으로 전달된다", () => {
    renderWithProviders(<LocationProbe />, {
      route: { pathname: "/reports", search: "?sort=latest", state: { from: "/dashboard" } },
    });
    expect(screen.getByTestId("pathname")).toHaveTextContent("/reports");
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=latest");
    expect(screen.getByTestId("state")).toHaveTextContent('{"from":"/dashboard"}');
  });

  it("주입한 queryClient 가 Provider 와 반환값 모두에서 같은 인스턴스로 쓰인다", () => {
    const injected = new QueryClient();
    let seen: QueryClient | null = null;
    const { queryClient } = renderWithProviders(
      <ClientProbe
        onClient={(client) => {
          seen = client;
        }}
      />,
      { queryClient: injected },
    );
    expect(queryClient).toBe(injected);
    expect(seen).toBe(injected);
  });

  it("기본 QueryClient 는 query retry 가 비활성이다 (실패 테스트의 결정성)", () => {
    const { queryClient } = renderWithProviders(<div />);
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
  });
});
