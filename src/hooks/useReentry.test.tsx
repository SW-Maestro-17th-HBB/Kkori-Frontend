/* useReentry 테스트 — 국면(세대) 기준 늦은 응답 폐기 검증.
   오버레이·수렴 등 화면 경로는 InterviewPage.test.tsx 가 다룬다. */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Room } from "livekit-client";
import { reenterInterviewSession } from "../api/client";
import type { ReenterSessionResponse } from "../api/client";
import { useReentry } from "./useReentry";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  reenterInterviewSession: vi.fn(),
}));

// 지연 상수 제거 — 스케줄 값이 아니라 폐기 동작을 검증한다
vi.mock("../api/reentryContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/reentryContract")>()),
  REENTRY_ATTEMPT_DELAYS_MS: [0, 0, 0],
}));

const reenterMock = vi.mocked(reenterInterviewSession);

const makeWrapper = () => {
  const client = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const issuedResponse: ReenterSessionResponse = {
  url: "wss://re.example",
  token: "jwt-late",
  room: "room-1",
};

describe("useReentry — 세대 기준 늦은 응답 폐기", () => {
  beforeEach(() => {
    reenterMock.mockReset();
  });

  it("복구 후 재끊김으로 재무장해도 이전 국면의 늦은 발급 응답은 폐기한다", async () => {
    let resolveIssued!: (value: ReenterSessionResponse) => void;
    reenterMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveIssued = resolve;
      }),
    );
    reenterMock.mockImplementation(() => new Promise<never>(() => {})); // 새 국면의 시도는 관망
    const onIssued = vi.fn();
    const onDenied = vi.fn();
    const room = new Room();
    const props = (over: { triggered?: boolean } = {}) => ({
      room,
      sessionId: 34,
      triggered: true,
      suspended: false,
      halted: false,
      onIssued,
      onDenied,
      ...over,
    });

    const { rerender } = renderHook((p) => useReentry(p), {
      initialProps: props(),
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(1); // 1국면의 발급이 걸려 있는 상태
    });

    rerender(props({ triggered: false })); // 연결 복구 — 국면 종료
    rerender(props({ triggered: true })); // 다시 끊김 — 재무장(새 국면)

    await act(async () => {
      resolveIssued(issuedResponse); // 1국면의 늦은 성공 도착
    });
    expect(onIssued).not.toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
  });

  it("언마운트 후 도착한 응답은 무효화된다", async () => {
    let resolveIssued!: (value: ReenterSessionResponse) => void;
    reenterMock.mockReturnValue(
      new Promise((resolve) => {
        resolveIssued = resolve;
      }),
    );
    const onIssued = vi.fn();
    const { unmount } = renderHook(
      () =>
        useReentry({
          room: new Room(),
          sessionId: 34,
          triggered: true,
          suspended: false,
          halted: false,
          onIssued,
          onDenied: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalled();
    });

    unmount();
    await act(async () => {
      resolveIssued(issuedResponse);
    });
    expect(onIssued).not.toHaveBeenCalled();
  });
});
