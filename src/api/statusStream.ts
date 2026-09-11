/* ============================================================
   상태 SSE 구독 공통 (이력서 PRD §3 · 리포트 report.md §5)
   - 사용자 단위 단일 연결 — 본인 자원의 이벤트만 수신
   - 브라우저 표준 EventSource 는 Authorization 헤더 미지원 → fetch 기반 클라이언트 사용
   - 이벤트는 "바뀌었다"는 신호로만 쓰고 화면 상태는 REST 재조회로 갱신한다
     (SSE 는 유실 허용 설계 — 끊긴 동안의 이벤트는 재전송되지 않으므로, payload 를 캐시에
      직접 반영하면 유실 구간에서 화면과 서버가 어긋난다. 재연결 시 목록 재조회로 복구한다)
   - 같은 이벤트를 알림 센터(notifications.ts)에도 넘긴다 — 알림도 유실을 허용하는 부가 채널
   - 보호 구역 전체에서 한 번만 마운트한다(App.tsx StatusStreams). 화면마다 연결하면 탭당
     연결 수가 늘고 화면 이동마다 재연결되며, 알림은 어느 화면에 있든 받아야 하기 때문
   ============================================================ */
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { pushStatusEvent, type NotificationKind, type StatusEvent } from "./notifications";
import { API_BASE_URL } from "./request";
import { getAccessToken } from "./tokenStore";

export interface StatusStreamConfig {
  path: string;
  kind: NotificationKind;
  /** 이벤트 수신·재연결 시 무효화할 쿼리 키 — 접두사 매칭이라 하위 캐시도 함께 갱신된다 */
  queryKey: readonly unknown[];
  /** 백엔드가 발행하는 이벤트명 → 단계. 목록에 없는 이벤트(keep-alive ping 등)는 무시 */
  events: Readonly<Record<string, StatusEvent["phase"]>>;
  /** data 에서 자원 id 를 읽는 필드명 */
  idField: "reportId" | "resumeId";
}

/** 재연결해도 회복 불가능한 SSE 오류(예: 인증 실패). onerror 가 이를 rethrow 해 재연결을 멈춘다. */
class FatalSseError extends Error {}

/** 이벤트 data → 알림 이벤트. 계약과 다른 payload(비 JSON·id 없음)는 알림만 건너뛴다 */
function parseStatusEvent(
  config: StatusStreamConfig,
  phase: StatusEvent["phase"],
  data: string,
): StatusEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const { [config.idField]: id, message } = payload as Record<string, unknown>;
  if (typeof id !== "number") return null;
  return {
    kind: config.kind,
    resourceId: id,
    phase,
    message: typeof message === "string" ? message : null,
  };
}

/**
 * 상태 스트림 구독. config 는 모듈 상수여야 한다 — 매 렌더 새 객체를 넘기면 effect 가
 * 다시 실행되어 연결이 끊겼다 이어진다.
 * 탭이 숨겨지면 연결을 닫고 다시 보이면 재연결(라이브러리 기본) — 재연결 시 REST 재동기화.
 */
export function useStatusStream(config: StatusStreamConfig) {
  const queryClient = useQueryClient();
  useEffect(() => {
    // 보호 구역에서만 마운트되지만, 토큰이 없으면 연결 시도 자체를 생략
    if (!getAccessToken()) return;
    const ctrl = new AbortController();
    let opened = false;
    let retry = 0;
    fetchEventSource(`${API_BASE_URL}${config.path}`, {
      signal: ctrl.signal,
      // 매 (재)연결 직전에 최신 AT 를 부착 — REST 쪽 자동 재발급으로 회전된 토큰을
      // 다음 재연결 시도가 자연히 줍는다 (SSE 자체는 재발급을 트리거하지 않음)
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        const token = getAccessToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
      async onopen(res) {
        if (res.ok) {
          retry = 0; // 연결 성공 — 백오프 리셋
          // 재연결: 끊긴 동안의 이벤트는 재전송되지 않으므로 REST 로 현재 상태를 동기화한다.
          // 첫 연결은 화면 진입 조회(useReports·useResumes)가 동기화를 담당하므로 생략.
          if (opened) await queryClient.invalidateQueries({ queryKey: config.queryKey });
          opened = true;
          return;
        }
        // 인증 실패(401/403)는 재연결해도 무의미 — onerror 가 rethrow 해 영구 중단시킨다
        if (res.status === 401 || res.status === 403) {
          throw new FatalSseError(`SSE 인증 실패 (HTTP ${res.status})`);
        }
        throw new Error(`SSE 연결 실패 (HTTP ${res.status})`); // 그 외는 재시도(백오프)
      },
      onmessage(ev) {
        const phase = config.events[ev.event];
        if (!phase) return;
        void queryClient.invalidateQueries({ queryKey: config.queryKey });
        const statusEvent = parseStatusEvent(config, phase, ev.data);
        if (statusEvent) pushStatusEvent(queryClient, statusEvent);
      },
      // 서버·프록시가 응답을 정상 종료하면(SseEmitter 타임아웃, LB 유휴 종료 등) 라이브러리는
      // 재연결하지 않고 끝낸다 — throw 해서 onerror 의 재시도(백오프) 경로로 보낸다
      onclose() {
        throw new Error("SSE 연결이 종료됨");
      },
      onerror(err) {
        if (err instanceof FatalSseError) throw err; // 인증 실패 → 재연결 영구 중단
        // 그 외(네트워크 등)는 지수 백오프로 재시도한다(throw 하지 않으면 재연결). 상한 30초.
        retry += 1;
        return Math.min(1000 * 2 ** (retry - 1), 30_000);
      },
    }).catch(() => {
      // 여기 도달하는 건 onerror 가 rethrow 한 인증 실패뿐이다(abort 는 reject 가 아니라 resolve).
      // 재연결을 멈추는 게 목적이므로 삼킨다 — 재발급·재로그인은 REST 요청 경로(request.ts)가 맡는다.
    });
    return () => ctrl.abort();
  }, [queryClient, config]);
}
