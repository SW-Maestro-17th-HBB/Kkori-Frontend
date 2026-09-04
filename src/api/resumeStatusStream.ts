/* ============================================================
   이력서 분석 상태 SSE 구독 (HBB1-271, PRD §3)
   - 사용자 단위 단일 연결(GET /sse/v1/resumes) — 본인 이력서 이벤트만 수신
   - 브라우저 표준 EventSource 는 Authorization 헤더 미지원 → fetch 기반 클라이언트 사용
   - 이벤트는 "바뀌었다"는 신호로만 쓰고 화면 상태는 REST 재조회로 갱신한다
     (단일 소스 유지 — 끊긴 동안의 이벤트는 재전송되지 않는 계약이라, 이벤트 payload 를
      캐시에 직접 반영하면 유실 구간에서 화면과 서버가 어긋난다)
   ============================================================ */
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { API_BASE_URL } from "./request";
import { getAccessToken } from "./tokenStore";

export const RESUME_SSE_PATH = "/sse/v1/resumes";

/** 백엔드가 발행하는 이벤트 3종 — 그 외(keep-alive ping 등)는 무시 */
const RESUME_EVENTS: ReadonlySet<string> = new Set([
  "RESUME_ANALYSIS_STATUS_CHANGED",
  "RESUME_ANALYSIS_COMPLETED",
  "RESUME_ANALYSIS_FAILED",
]);

/**
 * 이력서 상태 스트림 구독 — 이력서를 보여주는 화면에서 마운트한다.
 * 이벤트 수신 시 resumes 쿼리를 무효화한다. queryKey 접두사 매칭이라
 * 미리보기(["resumes","parsed",id]) 캐시도 함께 갱신된다(재분석 완료 반영).
 * 탭이 숨겨지면 연결을 닫고 다시 보이면 재연결(라이브러리 기본) — 재연결 시 REST 재동기화.
 */
export function useResumeStatusStream() {
  const queryClient = useQueryClient();
  useEffect(() => {
    // 보호 화면(RequireAuth)에서만 마운트되지만, 토큰이 없으면 연결 시도 자체를 생략
    if (!getAccessToken()) return;
    const ctrl = new AbortController();
    let opened = false;
    void fetchEventSource(`${API_BASE_URL}${RESUME_SSE_PATH}`, {
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
        if (!res.ok) throw new Error(`SSE 연결 실패 (HTTP ${res.status})`);
        // 재연결: 끊긴 동안의 이벤트는 재전송되지 않으므로 REST 로 현재 상태를 동기화한다.
        // 첫 연결은 화면 진입 조회(useResumes)가 동기화를 담당하므로 생략.
        if (opened) await queryClient.invalidateQueries({ queryKey: ["resumes"] });
        opened = true;
      },
      onmessage(ev) {
        if (!RESUME_EVENTS.has(ev.event)) return;
        void queryClient.invalidateQueries({ queryKey: ["resumes"] });
      },
      onerror() {
        // undefined 반환 → 라이브러리 기본 간격으로 재연결. throw 하면 재연결이 영구히 멈춘다.
      },
    });
    return () => ctrl.abort();
  }, [queryClient]);
}
