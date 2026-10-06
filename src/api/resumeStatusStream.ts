/* 이력서 분석 상태 SSE 구독 (HBB1-271, PRD §3) — 연결·재연결·알림 전달은 statusStream.ts 공통.
   이벤트 수신 시 resumes 쿼리를 무효화한다. queryKey 접두사 매칭이라
   미리보기(["resumes","parsed",id]) 캐시도 함께 갱신된다(재분석 완료 반영). */
import { useStatusStream, type StatusStreamConfig } from "./statusStream";

export const RESUME_SSE_PATH = "/sse/v1/resumes";

const RESUME_STREAM: StatusStreamConfig = {
  path: RESUME_SSE_PATH,
  kind: "resume",
  queryKey: ["resumes"],
  events: {
    RESUME_ANALYSIS_STATUS_CHANGED: "changed",
    RESUME_ANALYSIS_COMPLETED: "completed",
    RESUME_ANALYSIS_FAILED: "failed",
  },
  idField: "resumeId",
};

/** 보호 구역에서 한 번만 마운트한다(App.tsx StatusStreams) — 화면에서 직접 부르지 않는다 */
export function useResumeStatusStream() {
  useStatusStream(RESUME_STREAM);
}
