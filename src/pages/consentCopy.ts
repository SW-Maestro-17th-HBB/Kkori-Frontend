/* ============================================================
   동의서 문안 자산 — 버전별 불변 (백엔드 PRD consent.md 기능 1)
   서버는 항목 집합·필수 여부·현재 버전만 제공하고, 표시 이름·본문·순서는
   프론트 소유. 카탈로그의 version 으로 표시할 문안을 선택하고 제출 시
   그 버전을 그대로 반향한다 — type 만으로 매핑하면 개정 시 구버전 본문을
   보여주면서 신버전에 동의한 것으로 기록되어 감사 필드가 깨진다.

   버전 인상 절차: 여기에 새 버전 문안을 추가·배포한 뒤 서버 설정을
   인상한다(consent.md 배포 정합성). 기존 버전 문안은 수정하지 않는다.
   ============================================================ */
import type { ConsentType } from "../api/client";

export interface ConsentCopy {
  title: string;
  body: string;
}

/** 화면 표시 순서 (프론트 소유) */
export const CONSENT_ORDER: readonly ConsentType[] = [
  "privacy",
  "audio_usage",
  "resume_usage",
  "marketing",
] as const;

export const CONSENT_COPY: Record<ConsentType, Record<number, ConsentCopy>> = {
  privacy: {
    1: {
      title: "개인정보 수집·이용",
      body: "계정 생성과 운영을 위해 카카오 회원번호, 이메일, 닉네임을 수집·이용해요. 수집한 정보는 회원 식별과 서비스 제공 목적으로만 사용하고, 목적 달성 후 지체 없이 파기해요.",
    },
  },
  audio_usage: {
    1: {
      title: "음성 데이터 활용",
      body: "면접 연습 중 녹음된 음성을 수집해요. 수집한 음성은 답변 분석과 피드백 리포트 생성에만 사용하고, AI 모델 학습 등 다른 목적으로는 활용하지 않아요.",
    },
  },
  resume_usage: {
    1: {
      title: "이력서 자료 활용",
      body: "업로드한 이력서와 자료를 수집해요. 수집한 자료는 맞춤 면접 질문 생성에만 사용하고, 별도 동의 없이 제3자에게 제공하지 않아요.",
    },
  },
  marketing: {
    1: {
      title: "마케팅 정보 수신",
      body: "신규 기능, 이벤트 등 소식을 이메일로 받아봐요. 언제든 수신을 거부할 수 있어요.",
    },
  },
};
