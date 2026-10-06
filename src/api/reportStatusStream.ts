/* 리포트 생성 상태 SSE 구독 (report.md §5) — 연결·재연결·알림 전달은 statusStream.ts 공통.
   이벤트 수신 시 reports 쿼리를 무효화한다. queryKey 접두사 매칭이라
   통계(["reports","stats"])·상세(["reports","detail",id]) 캐시도 함께 갱신된다.
   PENDING 은 push 되지 않는다 — 이벤트는 PROCESSING 부터 흐르고, PENDING 은 REST 동기화로 인지한다. */
import { useStatusStream, type StatusStreamConfig } from "./statusStream";

export const REPORT_SSE_PATH = "/sse/v1/reports";

const REPORT_STREAM: StatusStreamConfig = {
  path: REPORT_SSE_PATH,
  kind: "report",
  queryKey: ["reports"],
  events: {
    REPORT_GENERATION_STATUS_CHANGED: "changed",
    REPORT_GENERATION_COMPLETED: "completed",
    REPORT_GENERATION_FAILED: "failed",
  },
  idField: "reportId",
};

/** 보호 구역에서 한 번만 마운트한다(App.tsx StatusStreams) — 화면에서 직접 부르지 않는다 */
export function useReportStatusStream() {
  useStatusStream(REPORT_STREAM);
}
