/* ============================================================
   목 데이터 — 프로토타입 하드코딩 값 그대로.
   API 연동 시 client.ts의 fetch 구현만 교체하면 됨.
   ============================================================ */
import type { NotificationItem, Profile, ReportDetail, Subscription } from "./types";

export const profile: Profile = {
  name: "홍길동",
  email: "hong@example.com",
  initials: "홍",
  joinedAt: "2026.05.10",
  kakaoLinked: true,
};

export const subscription: Subscription = {
  plan: "free",
  usedRealInterviews: 1,
  maxRealInterviews: 3,
};

export const notifications: NotificationItem[] = [
  {
    id: 1,
    icon: "check-circle-2",
    tone: "done",
    title: "리포트가 준비됐어요",
    desc: "백엔드 개발자 · 실전 30분 · 82점",
    time: "방금 전",
    unread: true,
    to: "reportDetail",
  },
  {
    id: 2,
    icon: "loader",
    tone: "ing",
    title: "이력서 분석이 끝나면 알려드릴게요",
    desc: "신입_포트폴리오.pdf · 62%",
    time: "5분 전",
    unread: true,
    to: "resume",
  },
  {
    id: 3,
    icon: "trending-up",
    tone: "info",
    title: "이번 주 평균 점수가 4점 올랐어요",
    desc: "꾸준히 연습한 덕분이에요",
    time: "어제",
    unread: false,
    to: "reportList",
  },
];

/** 공개 예시 리포트(/sample) 전용 정적 데이터 — 비로그인 쇼케이스라 실제 API를 호출하지 않는다.
    실제 리포트 상세는 client.ts fetchReportDetail 이 백엔드에서 가져온다.
    전달력은 음성 분석 도입 전이라 null(→"음성 분석 예정"), 타임라인은 예시 시연용으로 채워둔다. */
export const sampleReportDetail: ReportDetail = {
  id: 1,
  date: "2026.06.03",
  resumeName: "백엔드_개발자_이력서.pdf",
  type: "실전 30분",
  score: 82,
  summary:
    "전반적으로 논리적인 답변이 돋보였습니다. 다만 결론을 먼저 제시하는 두괄식 구성과 수치 기반 근거를 보강하면 설득력이 한층 높아지겠습니다.",
  questionCount: 3,
  axes: [
    ["논리 구성", 85],
    ["답변 구체성", 72],
    ["기술 정확도", 88],
    ["전달력", null],
  ],
  weaknesses: [
    ["두괄식 부족", 3, 3],
    ["말 속도 빠름", 2, 3],
    ["근거 부족", 2, 3],
  ],
  weaknessSummary: "두괄식 부족",
  tasks: [
    ["결론부터 말하기 (PREP)", "답변 첫 문장에 핵심 결론 배치"],
    ["수치·사례로 근거 보강", "“왜”에 정량적 근거 1개 이상"],
  ],
  aiDisclaimer:
    "이 리포트는 AI가 자동 생성한 분석 결과로, 실제 면접 평가와 다를 수 있습니다. 참고용으로 활용해 주세요.",
  timeline: [
    {
      q: "자기소개를 부탁드려요.",
      score: 80,
      tail: false,
      note: "두괄식으로 시작하면 더 좋아요",
      lines: 2,
    },
    {
      q: "최근 프로젝트의 기술 스택 선택 이유는?",
      score: 88,
      tail: false,
      note: "기술 정확도 우수 · 근거 구체적",
      lines: 3,
    },
    {
      q: "그 결정에서 가장 어려웠던 점은?",
      score: 73,
      tail: true,
      note: "답변 속도 빠름 · 사례 부족",
      lines: 2,
    },
  ],
};
