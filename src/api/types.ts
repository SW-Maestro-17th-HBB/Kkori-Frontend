/* ============================================================
   API 도메인 타입 — 현재는 목 데이터, 백엔드 연동 시 이 계약 유지
   ============================================================ */
import type { NavKey } from "../routes";

export type ResumeStatus = "done" | "ing" | "fail";

/** 면접 직무 — 세션 생성 계약의 position 값 (화면 라벨은 별도 매핑) */
export type Position = "BACKEND" | "FRONTEND";

/** 면접 유형 — ③ 시간 선택이 곧 유형 (5분/30분, CS는 향후 값 추가) */
export type InterviewType = "FIVE_MIN" | "THIRTY_MIN";

/** 세션 생성 요청 — 백엔드 합의 계약(구현·스키마 반영 대기).
    resumeId는 실전 모의(THIRTY_MIN) 필수·빠른 연습(FIVE_MIN) 선택 — 미선택 시 필드 생략 */
export interface CreateSessionRequest {
  resumeId?: number;
  interviewType: InterviewType;
  position: Position;
}

export interface Resume {
  id: number;
  name: string;
  ext: "PDF" | "DOC";
  meta: string; // 예: "2.4MB · 2일 전"
  uploadedAt: string; // 예: "2026.06.01"
  status: ResumeStatus;
  progress?: number; // 분석 중일 때 진행률 (백엔드 status 기반 프론트 매핑)
}

export interface ReportSummary {
  id: number;
  date: string;
  score: number;
  title: string;
  resumeName: string;
  resumeExt: "PDF" | "DOC";
  type: string; // 예: "실전 30분"
  tags: string[];
}

export interface TrendPoint {
  d: string; // 예: "6.03"
  s: number;
}

export interface ReportStats {
  avgScore: number;
  avgDelta: string; // 예: "지난달 대비 +5"
  totalCount: number;
  bestScore: number;
  trend: TrendPoint[];
  axisAverages: [string, number][];
  weaknessSegments: [string, number][]; // [이름, 지적 횟수]
  recentTrend: TrendPoint[]; // 대시보드 "최근 3회 흐름"
  recentAvg: number;
  recentDelta: number;
}

export interface TimelineItem {
  q: string;
  score: number;
  tail: boolean;
  note: string;
  lines: number;
}

export interface ReportDetail {
  id: number;
  date: string;
  resumeName: string;
  type: string;
  score: number;
  rank: string; // 예: "상위 18% · 안정적"
  axes: [string, number][];
  weaknesses: [string, number, number][]; // [이름, 지적 횟수, 전체 질문 수]
  weaknessSummary: string; // 가장 잦은 약점 이름
  tasks: [string, string][];
  timeline: TimelineItem[];
}

export interface Profile {
  name: string;
  email: string;
  initials: string;
  joinedAt: string;
  kakaoLinked: boolean;
}

export interface Subscription {
  plan: "free" | "pro";
  usedRealInterviews: number;
  maxRealInterviews: number;
}

/** LiveKit 접속 세션 — 서버 주소 + 참가자 토큰(룸·identity·권한 내장).
    백엔드 발급 API 연동 시에도 이 계약 유지 */
export interface LiveKitSession {
  url: string;
  token: string;
}

export interface NotificationItem {
  id: number;
  icon: string;
  tone: "done" | "ing" | "info";
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  to: NavKey;
}
