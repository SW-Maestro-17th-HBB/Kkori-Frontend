import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/fetch-event-source", () => ({
  // 실제 라이브러리는 연결이 살아있는 동안 pending — 테스트에선 호출 기록만 필요
  fetchEventSource: vi.fn(() => new Promise<void>(() => {})),
}));

import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { FetchEventSourceInit } from "@microsoft/fetch-event-source";
import { NOTIFICATIONS_KEY, type AppNotification } from "./notifications";
import { REPORT_SSE_PATH, useReportStatusStream } from "./reportStatusStream";
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

const message = (event: string, data: string) => ({ id: "", event, data, retry: undefined });

const notificationsOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<AppNotification[]>(NOTIFICATIONS_KEY) ?? [];

/** onopen 이 거부한 오류를 onerror 에 그대로 넘기기 위해 꺼낸다 */
const openError = (status: number) =>
  lastOptions().onopen!(new Response(null, { status })).then(
    () => {
      throw new Error("onopen 이 거부하지 않았다");
    },
    (e: unknown) => e,
  );

const mount = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = renderHook(() => useReportStatusStream(), {
    wrapper: createQueryWrapper(queryClient),
  });
  return { ...view, invalidate, queryClient };
};

describe("useReportStatusStream", () => {
  beforeEach(() => loginAs("at-1"));
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("리포트 SSE 엔드포인트에 연결한다", () => {
    mount();
    expect(mockedFES).toHaveBeenCalledWith(REPORT_SSE_PATH, expect.anything());
  });

  it("리포트 이벤트 수신 시 reports 쿼리를 무효화한다 (통계·상세 캐시도 접두사 매칭으로 포함)", () => {
    const { invalidate } = mount();

    for (const event of [
      "REPORT_GENERATION_STATUS_CHANGED",
      "REPORT_GENERATION_COMPLETED",
      "REPORT_GENERATION_FAILED",
    ]) {
      lastOptions().onmessage!(message(event, '{"reportId":1,"status":"PROCESSING"}'));
    }

    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reports"] });
  });

  it("리포트 이벤트가 아닌 메시지는 무시한다", () => {
    const { invalidate, queryClient } = mount();
    lastOptions().onmessage!(message("ping", ""));
    expect(invalidate).not.toHaveBeenCalled();
    expect(notificationsOf(queryClient)).toEqual([]);
  });

  it("이벤트를 알림 센터에 쌓는다 — 진행 중 행을 완료 행이 덮어쓰고, 실패 사유는 message 로 전달된다", () => {
    const { queryClient } = mount();
    const on = lastOptions().onmessage!;

    on(message("REPORT_GENERATION_STATUS_CHANGED", '{"reportId":12,"status":"PROCESSING"}'));
    expect(notificationsOf(queryClient)).toMatchObject([
      { key: "report:12", tone: "ing", unread: false },
    ]);

    on(message("REPORT_GENERATION_COMPLETED", '{"reportId":12,"status":"COMPLETED"}'));
    expect(notificationsOf(queryClient)).toMatchObject([
      { key: "report:12", tone: "done", unread: true, href: "/reports/12" },
    ]);

    on(
      message(
        "REPORT_GENERATION_FAILED",
        '{"reportId":13,"status":"FAILED","message":"대본이 비어 있어요"}',
      ),
    );
    expect(notificationsOf(queryClient).map((n) => n.key)).toEqual(["report:13", "report:12"]);
    expect(notificationsOf(queryClient)[0]).toMatchObject({
      tone: "fail",
      desc: "대본이 비어 있어요",
    });
  });

  it("계약과 다른 payload(비 JSON·id 없음)는 화면 갱신만 하고 알림은 건너뛴다", () => {
    const { invalidate, queryClient } = mount();
    lastOptions().onmessage!(message("REPORT_GENERATION_COMPLETED", "not-json"));
    lastOptions().onmessage!(message("REPORT_GENERATION_COMPLETED", '{"status":"COMPLETED"}'));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(notificationsOf(queryClient)).toEqual([]);
  });

  it("첫 연결은 동기화를 생략하고, 재연결에서만 REST 재동기화한다", async () => {
    const { invalidate } = mount();
    const ok = new Response(null, { status: 200 });

    await lastOptions().onopen!(ok); // 첫 연결 — 화면 진입 조회가 동기화 담당
    expect(invalidate).not.toHaveBeenCalled();

    await lastOptions().onopen!(ok); // 재연결 — 끊긴 동안의 이벤트는 재전송되지 않음
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reports"] });
  });

  it("인증 실패(401/403)는 onerror 가 rethrow 해 재연결을 영구 중단한다", async () => {
    mount();
    for (const status of [401, 403]) {
      const err = await openError(status);
      expect(() => lastOptions().onerror!(err)).toThrow(/인증 실패/);
    }
  });

  it("그 외 오류는 지수 백오프(1s → 2s → 4s, 상한 30s)로 재시도한다", async () => {
    mount();
    const onerror = lastOptions().onerror!;
    const err = await openError(502);

    expect(onerror(err)).toBe(1000);
    expect(onerror(new TypeError("Failed to fetch"))).toBe(2000);
    expect(onerror(err)).toBe(4000);
    for (let i = 0; i < 10; i++) onerror(err);
    expect(onerror(err)).toBe(30_000);
  });

  it("연결 성공 시 백오프를 리셋한다", async () => {
    mount();
    const { onopen, onerror } = lastOptions();
    onerror!(new TypeError("Failed to fetch"));
    onerror!(new TypeError("Failed to fetch"));
    expect(onerror!(new TypeError("Failed to fetch"))).toBe(4000);

    await onopen!(new Response(null, { status: 200 }));
    expect(onerror!(new TypeError("Failed to fetch"))).toBe(1000);
  });

  it("언마운트 시 연결을 중단한다", () => {
    const { unmount } = mount();
    const signal = lastOptions().signal!;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("서버가 연결을 정상 종료하면 onclose 가 throw 해 재시도(백오프) 경로로 보낸다", () => {
    mount();
    const { onclose, onerror } = lastOptions();
    let closed: unknown = null;
    try {
      onclose!();
    } catch (e) {
      closed = e;
    }
    expect(closed).toBeInstanceOf(Error);
    expect(onerror!(closed)).toBe(1000); // 인증 실패가 아니므로 재연결한다
  });

  it("인증 실패로 스트림 Promise 가 거부돼도 처리되지 않은 거부를 남기지 않는다", async () => {
    mockedFES.mockImplementationOnce(() => Promise.reject(new Error("SSE 인증 실패 (HTTP 401)")));
    mount();
    // 거부가 전파될 틈을 준다 — 미처리 거부가 남으면 vitest 가 실행을 실패시킨다
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
