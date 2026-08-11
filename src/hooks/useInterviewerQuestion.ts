/* ============================================================
   면접관 질문 텍스트 훅 — 에이전트(livekit-agents AgentSession)가 기본
   발행하는 lk.transcription 텍스트 스트림을 구독해, 마지막으로 완료된
   면접관 발화를 노출한다.
   표시 전용이다 — 리포트용 transcript 원본은 에이전트의 Redis→DB 경로가
   담당하며, 프론트 수신은 유실·중복이 있어 데이터 소스로 쓰지 않는다.
   ============================================================ */
import { useEffect, useState } from "react";
import type { Room } from "livekit-client";

/** livekit-agents 1.x 전사 스트림 토픽 */
export const TRANSCRIPTION_TOPIC = "lk.transcription";

export function useInterviewerQuestion(room: Room): string | null {
  const [question, setQuestion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, participant) => {
      // 내 발화(STT 자막)는 제외 — 전사 스트림의 sender identity 는 전사된 참가자다
      if (participant.identity === room.localParticipant.identity) return;
      // 에이전트 발화는 발화당 delta 스트림 1개다. 열림 시점 속성은
      // lk.transcription_final="false" 로 시작하고 final=true 는 닫힘 트레일러에만
      // 붙으므로, 열림 속성으로 확정 여부를 거르면 발화 전체가 버려진다(실측 확인 —
      // interim/final 이중 스트림 모델은 지원자 STT 쪽 이야기다).
      // readAll 은 스트림이 닫힐 때(발화 완료·중단) 실제 발화된 전체 텍스트로
      // resolve 하므로, 이 대기가 곧 "발화 완료 후 표시" 결정의 구현이다.
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
