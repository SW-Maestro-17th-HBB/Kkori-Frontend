/* ============================================================
   알림 센터 (HBB1-331) — 상태 SSE 이벤트를 앱 셸(TopNav 종 아이콘) 알림으로 바꾼다.
   - 원천은 이력서·리포트 상태 스트림(statusStream.ts)뿐이다. 백엔드에 알림 목록·읽음 API 가
     없으므로 목록은 이 탭의 세션 안에서만 산다 (새로고침·로그아웃 시 사라짐).
   - 저장소는 보호 구역의 세션 전용 QueryClient(["notifications"] 캐시) — 로그아웃·계정 교체
     시 클라이언트가 통째로 폐기되므로 이전 계정의 알림이 다음 사용자에게 남지 않는다.
   - 자원(리포트·이력서)당 한 행만 유지한다: 진행 중 행은 완료·실패 행이 덮어쓴다.
   - 표시 문구는 status 기반 프론트 매핑이다. 백엔드 message 는 status 로 유도할 수 없는
     정보(실패 사유) 전달용이라 FAILED 에서만 쓴다.
   ============================================================ */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { reportDetailPath, ROUTES } from "../routes";

export type NotificationKind = "report" | "resume";
export type NotificationTone = "done" | "ing" | "fail";

export interface AppNotification {
  /** `${kind}:${resourceId}` — 자원당 1행(최신 상태로 덮어씀) */
  key: string;
  kind: NotificationKind;
  resourceId: number;
  tone: NotificationTone;
  icon: string;
  title: string;
  desc: string;
  /** 수신 시각(ms) — 상대 시간 표시용 */
  at: number;
  unread: boolean;
  /** 행 클릭 시 이동 경로 */
  href: string;
}

/** 상태 스트림이 넘기는 이벤트 — SSE data {reportId|resumeId, status, message} 를 정규화한 형태 */
export interface StatusEvent {
  kind: NotificationKind;
  resourceId: number;
  phase: "changed" | "completed" | "failed";
  /** 백엔드 message — 실패 사유처럼 status 로 유도할 수 없는 정보 */
  message?: string | null;
}

export const NOTIFICATIONS_KEY = ["notifications"] as const;

/** 목록 상한 — 세션 안에서만 사는 목록이라 오래된 행은 버린다 */
export const MAX_NOTIFICATIONS = 30;

type Presentation = Pick<AppNotification, "tone" | "icon" | "title" | "desc" | "href" | "unread">;

/* 진행 중(changed)은 읽지 않은 상태로 두지 않는다 — 조치할 게 없는 정보라 뱃지를 켜면
   소음이 된다. 완료·실패는 확인이 필요하므로 읽지 않음으로 들어온다. */
function describeEvent(ev: StatusEvent): Presentation {
  const failReason = ev.message?.trim() || undefined;
  if (ev.kind === "report") {
    switch (ev.phase) {
      case "changed":
        return {
          tone: "ing",
          icon: "loader",
          title: "리포트를 만들고 있어요",
          desc: "완성되면 알려드릴게요",
          href: ROUTES.reportList,
          unread: false,
        };
      case "completed":
        return {
          tone: "done",
          icon: "check-circle-2",
          title: "리포트가 준비됐어요",
          desc: "면접 결과와 개선점을 확인해 보세요",
          href: reportDetailPath(ev.resourceId),
          unread: true,
        };
      case "failed":
        return {
          tone: "fail",
          icon: "circle-alert",
          title: "리포트 생성에 실패했어요",
          desc: failReason ?? "리포트 목록에서 다시 만들 수 있어요",
          href: ROUTES.reportList,
          unread: true,
        };
    }
  }
  switch (ev.phase) {
    case "changed":
      return {
        tone: "ing",
        icon: "loader",
        title: "이력서를 분석하고 있어요",
        desc: "분석이 끝나면 알려드릴게요",
        href: ROUTES.resume,
        unread: false,
      };
    case "completed":
      return {
        tone: "done",
        icon: "check-circle-2",
        title: "이력서 분석이 끝났어요",
        desc: "이제 이 이력서로 면접을 볼 수 있어요",
        href: ROUTES.resume,
        unread: true,
      };
    case "failed":
      return {
        tone: "fail",
        icon: "circle-alert",
        title: "이력서 분석에 실패했어요",
        desc: failReason ?? "이력서 화면에서 다시 분석할 수 있어요",
        href: ROUTES.resume,
        unread: true,
      };
  }
}

/** 순수 리듀서 — 같은 자원의 기존 행을 지우고 최신 행을 맨 앞에 둔다 */
export function applyStatusEvent(
  list: readonly AppNotification[],
  ev: StatusEvent,
  at: number,
): AppNotification[] {
  const key = `${ev.kind}:${ev.resourceId}`;
  const next: AppNotification = {
    key,
    kind: ev.kind,
    resourceId: ev.resourceId,
    at,
    ...describeEvent(ev),
  };
  return [next, ...list.filter((n) => n.key !== key)].slice(0, MAX_NOTIFICATIONS);
}

/** 스트림 → 캐시. 관찰자(useNotifications)가 아직 없어도 캐시 엔트리를 만들어 쌓아 둔다. */
export function pushStatusEvent(queryClient: QueryClient, ev: StatusEvent, at = Date.now()) {
  queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (prev = []) =>
    applyStatusEvent(prev, ev, at),
  );
}

/** 알림 목록 구독 — 서버 원천이 없어 queryFn 은 비어 있고, 스트림이 setQueryData 로 채운다.
    staleTime Infinity 라 재조회로 비워지지 않는다 */
export function useNotifications(): AppNotification[] {
  const { data } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => [] as AppNotification[],
    initialData: [] as AppNotification[],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data;
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const update = (fn: (list: AppNotification[]) => AppNotification[]) =>
      queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (prev = []) => fn(prev));
    return {
      markRead: (key: string) =>
        update((list) =>
          list.map((n) => (n.key === key && n.unread ? { ...n, unread: false } : n)),
        ),
      // 바뀐 게 없으면 같은 배열을 돌려줘 불필요한 리렌더를 막는다
      markAllRead: () =>
        update((list) =>
          list.some((n) => n.unread) ? list.map((n) => ({ ...n, unread: false })) : list,
        ),
      clear: () => update(() => []),
    };
  }, [queryClient]);
}

/** 상대 시간 문구 — 분 단위까지만 표시한다 (초 단위 갱신은 소음) */
export function formatRelativeTime(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "어제" : `${days}일 전`;
}
