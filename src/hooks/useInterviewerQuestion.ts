/* ============================================================
   면접관 질문 텍스트 훅 — 에이전트(livekit-agents AgentSession)가 기본
   발행하는 lk.transcription 텍스트 스트림을 구독해, 마지막으로 완료된
   (final) 면접관 발화를 노출한다. interim 세그먼트는 무시한다 — 발화가
   끝난 확정 텍스트만 표시한다 (제품 결정).
   표시 전용이다 — 리포트용 transcript 원본은 에이전트의 Redis→DB 경로가
   담당하며, 프론트 수신은 유실·중복이 있어 데이터 소스로 쓰지 않는다.
   ============================================================ */
import { useEffect, useState } from "react";
import type { Room } from "livekit-client";

/** livekit-agents 1.x 전사 스트림 계약 — 토픽·확정(final) 속성 키 */
export const TRANSCRIPTION_TOPIC = "lk.transcription";
const FINAL_ATTRIBUTE = "lk.transcription_final";

export function useInterviewerQuestion(room: Room): string | null {
  const [question, setQuestion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, participant) => {
      // 내 발화(STT 자막)는 제외 — 질문 패널은 면접관(에이전트) 발화만 다룬다
      if (participant.identity === room.localParticipant.identity) return;
      if (reader.info.attributes?.[FINAL_ATTRIBUTE] !== "true") return;
      void reader.readAll().then((text) => {
        const trimmed = text.trim();
        if (active && trimmed) setQuestion(trimmed);
      });
    });
    return () => {
      active = false;
      room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
    };
  }, [room]);

  return question;
}
