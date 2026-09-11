import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  applyStatusEvent,
  formatRelativeTime,
  MAX_NOTIFICATIONS,
  NOTIFICATIONS_KEY,
  pushStatusEvent,
  useNotificationActions,
  useNotifications,
  type AppNotification,
} from "./notifications";
import { createQueryWrapper } from "../test/render";

const T0 = 1_700_000_000_000;

describe("applyStatusEvent — 상태 이벤트 → 알림 행", () => {
  it("리포트 완료는 읽지 않음 상태로 상세 경로를 가리킨다", () => {
    const [row] = applyStatusEvent([], { kind: "report", resourceId: 12, phase: "completed" }, T0);
    expect(row).toMatchObject({
      key: "report:12",
      tone: "done",
      unread: true,
      href: "/reports/12",
      at: T0,
      title: "리포트가 준비됐어요",
    });
  });

  it("진행 중은 읽음 상태로 들어오고, 같은 자원의 완료가 그 행을 덮어쓴다 (자원당 1행)", () => {
    const ing = applyStatusEvent([], { kind: "resume", resourceId: 3, phase: "changed" }, T0);
    expect(ing).toHaveLength(1);
    expect(ing[0]).toMatchObject({ tone: "ing", unread: false, href: "/resumes" });

    const done = applyStatusEvent(
      ing,
      { kind: "resume", resourceId: 3, phase: "completed" },
      T0 + 1000,
    );
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ key: "resume:3", tone: "done", unread: true, at: T0 + 1000 });
  });

  it("실패는 백엔드 message 를 사유로 보여주고, 비어 있으면 기본 안내를 쓴다", () => {
    const withReason = applyStatusEvent(
      [],
      { kind: "report", resourceId: 1, phase: "failed", message: "대본이 비어 있어요" },
      T0,
    );
    expect(withReason[0]).toMatchObject({
      tone: "fail",
      icon: "circle-alert",
      desc: "대본이 비어 있어요",
      href: "/reports",
    });

    const noReason = applyStatusEvent(
      [],
      { kind: "resume", resourceId: 1, phase: "failed", message: "  " },
      T0,
    );
    expect(noReason[0].desc).toBe("이력서 화면에서 다시 분석할 수 있어요");
  });

  it("최신 행이 맨 앞에 오고, 상한을 넘으면 오래된 행을 버린다", () => {
    let list: AppNotification[] = [];
    for (let i = 0; i < MAX_NOTIFICATIONS + 5; i++) {
      list = applyStatusEvent(list, { kind: "report", resourceId: i, phase: "completed" }, T0 + i);
    }
    expect(list).toHaveLength(MAX_NOTIFICATIONS);
    expect(list[0].resourceId).toBe(MAX_NOTIFICATIONS + 4);
    expect(list.at(-1)!.resourceId).toBe(5);
  });
});

describe("알림 캐시 — 구독과 읽음 처리", () => {
  it("관찰자보다 먼저 쌓인 이벤트도 구독 시점에 보인다", () => {
    const queryClient = new QueryClient();
    pushStatusEvent(queryClient, { kind: "report", resourceId: 7, phase: "completed" }, T0);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.map((n) => n.key)).toEqual(["report:7"]);
  });

  it("markRead 는 해당 행만, markAllRead 는 전부 읽음으로 바꾸고, clear 는 비운다", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => ({ items: useNotifications(), actions: useNotificationActions() }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      pushStatusEvent(queryClient, { kind: "report", resourceId: 1, phase: "completed" }, T0);
      pushStatusEvent(queryClient, { kind: "resume", resourceId: 2, phase: "failed" }, T0 + 1);
    });
    await waitFor(() => expect(result.current.items.map((n) => n.unread)).toEqual([true, true]));

    act(() => result.current.actions.markRead("resume:2"));
    await waitFor(() =>
      expect(result.current.items.map((n) => [n.key, n.unread])).toEqual([
        ["resume:2", false],
        ["report:1", true],
      ]),
    );

    act(() => result.current.actions.markAllRead());
    await waitFor(() => expect(result.current.items.every((n) => !n.unread)).toBe(true));

    act(() => result.current.actions.clear());
    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(queryClient.getQueryData(NOTIFICATIONS_KEY)).toEqual([]);
  });
});

describe("formatRelativeTime", () => {
  it.each([
    [0, "방금 전"],
    [59_000, "방금 전"],
    [60_000, "1분 전"],
    [59 * 60_000, "59분 전"],
    [60 * 60_000, "1시간 전"],
    [23 * 3_600_000, "23시간 전"],
    [24 * 3_600_000, "어제"],
    [3 * 86_400_000, "3일 전"],
  ])("%d ms 전 → %s", (diff, label) => {
    expect(formatRelativeTime(T0 - diff, T0)).toBe(label);
  });

  it("미래 시각(시계 어긋남)은 방금 전으로 본다", () => {
    expect(formatRelativeTime(T0 + 5000, T0)).toBe("방금 전");
  });
});
