/* ============================================================
   목 데이터 — 프로토타입 하드코딩 값 그대로.
   API 연동 시 client.ts의 fetch 구현만 교체하면 됨.
   ============================================================ */
import type {
  NotificationItem,
  Profile,
  ReportDetail,
  ReportStats,
  ReportSummary,
  Resume,
  Subscription,
} from "./types";

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

export const resumes: Resume[] = [
  {
    id: 1,
    name: "백엔드_개발자_이력서.pdf",
    ext: "PDF",
    meta: "2.4MB · 2일 전",
    uploadedAt: "2026.06.01",
    status: "done",
    tag: "추천 · 백엔드 · 실전 30분",
    preview: {
      name: "홍길동",
      career: "3년 · 백엔드 (Java / Spring)",
      skills: ["Spring", "MySQL", "AWS"],
      projects: "결제 정산 시스템, 사내 알림 플랫폼",
    },
  },
  {
    id: 2,
    name: "경력기술서_2026.pdf",
    ext: "PDF",
    meta: "3.0MB · 6일 전",
    uploadedAt: "2026.05.20",
    status: "done",
    tag: "백엔드 · 실전 30분",
    preview: {
      name: "홍길동",
      career: "3년 · 백엔드 (Java / Spring)",
      skills: ["Spring", "MySQL", "AWS"],
      projects: "결제 정산 시스템, 사내 알림 플랫폼",
    },
  },
  {
    id: 3,
    name: "신입_포트폴리오.pdf",
    ext: "PDF",
    meta: "5.1MB · 방금 전",
    uploadedAt: "2026.06.05",
    status: "ing",
    progress: 62,
  },
  {
    id: 4,
    name: "이력서_v1.docx",
    ext: "DOC",
    meta: "1.2MB · 6일 전",
    uploadedAt: "2026.05.18",
    status: "fail",
  },
];

export const reports: ReportSummary[] = [
  {
    id: 1,
    date: "2026.06.03",
    score: 82,
    title: "백엔드 개발자 · 기술 면접",
    resumeName: "백엔드_개발자_이력서.pdf",
    resumeExt: "PDF",
    type: "실전 30분",
    tags: ["두괄식 부족", "말 속도 빠름"],
  },
  {
    id: 2,
    date: "2026.05.28",
    score: 74,
    title: "백엔드 개발자 · 인성 면접",
    resumeName: "백엔드_개발자_이력서.pdf",
    resumeExt: "PDF",
    type: "빠른 5분",
    tags: ["근거 부족", "시선 처리"],
  },
  {
    id: 3,
    date: "2026.05.20",
    score: 79,
    title: "프론트엔드 · 기술 면접",
    resumeName: "경력기술서_2026.pdf",
    resumeExt: "PDF",
    type: "실전 30분",
    tags: ["장황함"],
  },
  {
    id: 4,
    date: "2026.05.12",
    score: 68,
    title: "백엔드 개발자 · 기술 면접",
    resumeName: "경력기술서_2026.pdf",
    resumeExt: "PDF",
    type: "빠른 5분",
    tags: ["자신감", "두괄식 부족"],
  },
];

export const reportStats: ReportStats = {
  avgScore: 76,
  avgDelta: "지난달 대비 +5",
  totalCount: 4,
  bestScore: 82,
  trend: [
    { d: "5.12", s: 68 },
    { d: "5.20", s: 79 },
    { d: "5.28", s: 74 },
    { d: "6.03", s: 82 },
  ],
  axisAverages: [
    ["논리 구성", 82],
    ["기술 정확도", 85],
    ["답변 구체성", 70],
    ["전달력", 71],
  ],
  weaknessSegments: [
    ["두괄식 부족", 4],
    ["말 속도", 3],
    ["근거 부족", 2],
    ["기타", 2],
  ],
  recentTrend: [
    { d: "5.20", s: 79 },
    { d: "5.28", s: 74 },
    { d: "6.03", s: 82 },
  ],
  recentAvg: 78,
  recentDelta: 4,
};

export const reportDetail: ReportDetail = {
  id: 1,
  date: "2026.06.03",
  resumeName: "백엔드_개발자_이력서.pdf",
  type: "실전 30분",
  score: 82,
  rank: "상위 18% · 안정적",
  axes: [
    ["논리 구성", 85],
    ["답변 구체성", 72],
    ["기술 정확도", 88],
    ["전달력 (속도·간결성)", 74],
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
  timeline: [
    { q: "자기소개를 부탁드려요.", score: 80, tail: false, note: "두괄식으로 시작하면 더 좋아요", lines: 2 },
    { q: "최근 프로젝트의 기술 스택 선택 이유는?", score: 88, tail: false, note: "기술 정확도 우수 · 근거 구체적", lines: 3 },
    { q: "그 결정에서 가장 어려웠던 점은?", score: 73, tail: true, note: "답변 속도 빠름 · 사례 부족", lines: 2 },
  ],
};
