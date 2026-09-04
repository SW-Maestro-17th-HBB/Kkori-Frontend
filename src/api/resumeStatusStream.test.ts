import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/fetch-event-source", () => ({
  // 실제 라이브러리는 연결이 살아있는 동안 pending — 테스트에선 호출 기록만 필요
  fetchEventSource: vi.fn(() => new Promise<void>(() => {})),
}));

import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { FetchEventSourceInit } from "@microsoft/fetch-event-source";
import { RESUME_SSE_PATH, useResumeStatusStream } from "./resumeStatusStream";
import { createQueryWrapper } from "../test/render";

const mockedFES = vi.mocked(fetchEventSource);

const loginAs = (accessToken: string) =>
  localStorage.setItem(
    "kkori.auth",
    JSON.stringify({ accessToken, refreshToken: "rt", sessionId: "s1" }),
  );

const lastOptions = (): FetchEventSourceInit => {
  const call = mockedFES.mock.calls.at(-1);
  if (!call) throw new Error("fetchEventSource가 호출되지 않았다");
  return call[1] as FetchEventSourceInit;
};

const mount = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = renderHook(() => useResumeStatusStream(), {
    wrapper: createQueryWrapper(queryClient),
  });
  return { ...view, invalidate };
};

describe("useResumeStatusStream", () => {
  beforeEach(() => loginAs("at-1"));
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("SSE 엔드포인트에 연결하고, 매 연결 시도마다 최신 AT를 부착한다", async () => {
    mount();

    expect(mockedFES).toHaveBeenCalledWith(RESUME_SSE_PATH, expect.anything());

    // 커스텀 fetch 가 Authorization 헤더를 부착하는지 — 회전된 토큰도 다음 시도가 줍는다
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    loginAs("at-rotated");
    await lastOptions().fetch!(RESUME_SSE_PATH, {});
    const headers = new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer at-rotated");
    fetchSpy.mockRestore();
  });

  it("토큰이 없으면 연결을 시도하지 않는다", () => {
    localStorage.clear();
    mount();
    expect(mockedFES).not.toHaveBeenCalled();
  });

  it("이력서 이벤트 수신 시 resumes 쿼리를 무효화한다 (미리보기 캐시도 접두사 매칭으로 포함)", () => {
    const { invalidate } = mount();

    for (const event of [
      "RESUME_ANALYSIS_STATUS_CHANGED",
      "RESUME_ANALYSIS_COMPLETED",
      "RESUME_ANALYSIS_FAILED",
    ]) {
      lastOptions().onmessage!({ id: "", event, data: '{"resumeId":1}', retry: undefined });
    }

    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resumes"] });
  });

  it("이력서 이벤트가 아닌 메시지는 무시한다", () => {
    const { invalidate } = mount();
    lastOptions().onmessage!({ id: "", event: "ping", data: "", retry: undefined });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("첫 연결은 동기화를 생략하고, 재연결에서만 REST 재동기화한다 (PRD §3 프론트 규약)", async () => {
    const { invalidate } = mount();
    const ok = new Response(null, { status: 200 });

    await lastOptions().onopen!(ok); // 첫 연결 — 화면 진입 조회가 동기화 담당
    expect(invalidate).not.toHaveBeenCalled();

    await lastOptions().onopen!(ok); // 재연결 — 끊긴 동안의 이벤트는 재전송되지 않음
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resumes"] });
  });

  it("연결 실패 응답(비 2xx)은 throw 해 재시도 경로로 보낸다", async () => {
    mount();
    await expect(lastOptions().onopen!(new Response(null, { status: 401 }))).rejects.toThrow();
  });

  it("언마운트 시 연결을 중단한다", () => {
    const { unmount } = mount();
    const signal = lastOptions().signal!;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
