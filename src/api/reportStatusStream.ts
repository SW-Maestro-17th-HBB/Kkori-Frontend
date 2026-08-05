/* ============================================================
   리포트 생성 상태 SSE 구독 (report.md §5)
   - 사용자 단위 단일 연결(GET /sse/v1/reports) — 본인 리포트 이벤트만 수신
   - 브라우저 표준 EventSource 는 Authorization 헤더 미지원 → fetch 기반 클라이언트 사용
   - 이벤트는 "바뀌었다"는 신호로만 쓰고 화면 상태는 REST 재조회로 갱신한다
     (SSE 는 유실 허용 설계 — 끊긴 동안의 이벤트는 재전송되지 않으므로, payload 를 캐시에
      직접 반영하면 유실 구간에서 화면과 서버가 어긋난다. 재연결 시 목록 재조회로 복구한다)
   ============================================================ */
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { API_BASE_URL } from "./request";
import { getAccessToken } from "./tokenStore";

export const REPORT_SSE_PATH = "/sse/v1/reports";

/** 백엔드가 발행하는 이벤트 3종 — 그 외(keep-alive ping 등)는 무시 */
const REPORT_EVENTS: ReadonlySet<string> = new Set([
  "REPORT_GENERATION_STATUS_CHANGED",
  "REPORT_GENERATION_COMPLETED",
  "REPORT_GENERATION_FAILED",
]);

/** 재연결해도 회복 불가능한 SSE 오류(예: 인증 실패). onerror 가 이를 rethrow 해 재연결을 멈춘다. */
class FatalSseError extends Error {}

/**
 * 리포트 상태 스트림 구독 — 리포트를 보여주는 화면(목록·대시보드)에서 마운트한다.
 * 이벤트 수신 시 reports 쿼리를 무효화한다. queryKey 접두사 매칭이라
 * 통계(["reports","stats"])·상세(["reports","detail",id]) 캐시도 함께 갱신된다.
 * 탭이 숨겨지면 연결을 닫고 다시 보이면 재연결(라이브러리 기본) — 재연결 시 REST 재동기화.
 */
export function useReportStatusStream() {
  const queryClient = useQueryClient();
  useEffect(() => {
    // 보호 화면(RequireAuth)에서만 마운트되지만, 토큰이 없으면 연결 시도 자체를 생략
    if (!getAccessToken()) return;
    const ctrl = new AbortController();
    let opened = false;
    let retry = 0;
    void fetchEventSource(`${API_BASE_URL}${REPORT_SSE_PATH}`, {
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
          // 첫 연결은 화면 진입 조회(useReports)가 동기화를 담당하므로 생략.
          if (opened) await queryClient.invalidateQueries({ queryKey: ["reports"] });
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
        if (!REPORT_EVENTS.has(ev.event)) return;
        void queryClient.invalidateQueries({ queryKey: ["reports"] });
      },
      onerror(err) {
        if (err instanceof FatalSseError) throw err; // 인증 실패 → 재연결 영구 중단
        // 그 외(네트워크 등)는 지수 백오프로 재시도한다(throw 하지 않으면 재연결). 상한 30초.
        retry += 1;
        return Math.min(1000 * 2 ** (retry - 1), 30_000);
      },
    });
    return () => ctrl.abort();
  }, [queryClient]);
}
