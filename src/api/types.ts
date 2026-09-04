/* ============================================================
   API 도메인 타입 — 현재는 목 데이터, 백엔드 연동 시 이 계약 유지
   ============================================================ */
import type { NavKey } from "../routes";

export type ResumeStatus = "done" | "ing" | "fail";

/** 면접 직무 — 세션 생성 계약의 position 값 (화면 라벨은 별도 매핑) */
export type Position = "BACKEND" | "FRONTEND";

/** 면접 유형 — ③ 시간 선택이 곧 유형 (5분/30분, CS는 향후 값 추가) */
export type InterviewType = "FIVE_MIN" | "THIRTY_MIN";

/** 세션 생성 요청 — 생성 타입(InterviewSessionCreateRequest)과 구조 동일해야 하며
    어긋나면 client.ts의 fetcher 호출이 컴파일 에러로 잡는다.
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

/** 리포트 생성 상태 — 백엔드 ReportStatus enum과 동일 (미완성은 점수 없이 "생성 중") */
export type ReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface ReportSummary {
  id: number;
  status: ReportStatus;
  date: string;
  score: number | null; // 미완성(PENDING/PROCESSING/FAILED)은 null → "생성 중" 표시
  title: string;
  resumeName: string;
  resumeExt: "PDF" | "DOC";
  type: string; // 예: "실전 30분" — 리포트 API에 면접 유형 필드가 없어 현재는 목값
  tags: string[];
}

/** 리포트 목록 정렬 키·방향 (백엔드 지원 범위). */
export type ReportSortKey = "createdAt" | "overallScore";
export type ReportSortOrder = "asc" | "desc";

/** 목록 조회 파라미터 — status 미지정은 전체(필터 없음). */
export interface ReportListParams {
  status?: ReportStatus;
  sort: ReportSortKey;
  order: ReportSortOrder;
  page: number;
  size: number;
}

/** 목록 페이지 결과 — 백엔드 PageResponse(content·page·size·totalElements·hasNext) 매핑. */
export interface ReportPage {
  items: ReportSummary[];
  page: number;
  size: number;
  totalElements: number;
  hasNext: boolean;
}

export interface TrendPoint {
  d: string; // 예: "6.03"
  s: number;
}

export interface ReportStats {
  avgScore: number | null; // 완료 리포트 0건이면 null
  avgDelta: string; // 예: "지난달 대비 +5" — 비교 불가(monthlyDelta null)면 빈 문자열
  totalCount: number;
  bestScore: number | null;
  trend: TrendPoint[];
  axisAverages: [string, number | null][]; // 전달력은 음성 분석 도입 전까지 null
  weaknessSegments: [string, number][]; // [이름, 지적 횟수]
}

export interface TimelineEvaluation {
  logicScore: number | null;
  specificityScore: number | null;
  technicalAccuracyScore: number | null;
  feedback: string;
  weaknessTags: string[];
}

/** 타임라인 항목 — 질문 1개(+답변+평가). 백엔드 GET /reports/{id}/timeline 매핑. */
export interface TimelineEntry {
  questionNumber: number;
  isTail: boolean; // parentQuestionNumber !== questionNumber (본질문은 자기 번호와 동일 — 구조 규칙)
  parentQuestionNumber: number | null;
  question: string;
  answer: string; // 빈 문자열이면 "답변 없음"으로 표시
  evaluation: TimelineEvaluation | null; // null이면 평가 영역만 숨긴다
}

export interface ReportDetail {
  id: number;
  date: string;
  resumeName: string;
  type: string; // 리포트 API에 면접 유형 필드가 없어 현재는 목값
  score: number | null;
  summary: string; // 세션 총평
  questionCount: number;
  axes: [string, number | null][]; // 전달력은 음성 분석 도입 전까지 null
  weaknesses: [string, number, number][]; // [이름, 지적 횟수, 전체 질문 수]
  weaknessSummary: string; // 가장 잦은 약점 이름
  tasks: [string, string][];
  aiDisclaimer: string; // AI 분석 한계 안내 — 백엔드 값을 그대로 표시(하드코딩 금지)
  // 타임라인은 별도 API(GET /reports/{id}/timeline)로 분리 조회한다 (useReportTimeline)
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
