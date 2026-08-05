/* ============================================================
   API 클라이언트 — 도메인별로 목 → 실제 API 점진 교체 중.
   [실제] 인증(auth)·이력서(resume)  [목] 리포트·사용자·알림
   ============================================================ */
import * as fixtures from "./fixtures";
import {
  deleteResume as deleteResumeApi,
  getList,
  getParsed,
  reanalyze,
  updateParsed,
  upload,
} from "./generated/resume/resume";
import { create as createSessionApi } from "./generated/session/session";
import type {
  InterviewSessionCreateResponse,
  ResumeParsedResponse as ResumeParsedResponseModel,
  ResumeReanalyzeResponse as ResumeReanalyzeResponseModel,
  ResumeSummaryResponse,
  ResumeSummaryResponseAnalysisStatus,
  ResumeUploadResponse as ResumeUploadResponseModel,
  StructuredData as StructuredDataModel,
} from "./generated/kkoriAPI.schemas";
import { ApiError, FE_ERROR_CODES, request } from "./request";
import type { components } from "./schema";
import { getAuthSnapshot } from "./tokenStore";
import type {
  CreateSessionRequest,
  NotificationItem,
  Profile,
  ReportDetail,
  ReportListParams,
  ReportPage,
  ReportStats,
  ReportStatus,
  ReportSummary,
  Resume,
  ResumeStatus,
  Subscription,
  TimelineEntry,
} from "./types";

const delay = <T>(data: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

/* ---------- 인증 (실제 API) ---------- */

export type KakaoLoginResponse = components["schemas"]["KakaoLoginResponse"];
export type ConsentCatalogResponse = components["schemas"]["ConsentCatalogResponse"];
export type CatalogItem = components["schemas"]["CatalogItem"];
export type ConsentType = NonNullable<CatalogItem["type"]>;
export type SignupRequest = components["schemas"]["SignupRequest"];
export type ConsentItem = components["schemas"]["ConsentItem"];
export type TokenResponse = components["schemas"]["TokenResponse"];

export const postKakaoLogin = (code: string): Promise<KakaoLoginResponse> =>
  request<KakaoLoginResponse>("POST", "/api/v1/auth/kakao", { body: { code } });

// 버전 대조의 원천 — HTTP 캐시 재사용 금지(서버도 Cache-Control: no-store)
export const getConsentCatalog = (): Promise<ConsentCatalogResponse> =>
  request<ConsentCatalogResponse>("GET", "/api/v1/consents", { cache: "no-store" });

export const postSignup = (body: SignupRequest): Promise<TokenResponse> =>
  request<TokenResponse>("POST", "/api/v1/auth/signup", { body });

// 멱등 로그아웃 — bodyFactory: 만료 AT 로그아웃이 재발급으로 회전된 뒤의 재시도가
// 최신 RT 를 전송해 서버측 폐기를 완성한다. 단 **소유 세션이 현재 세션일 때만** —
// 대기 중 다른 계정이 로그인했으면 그 계정의 RT 를 전송(= 남의 세션을 서버에서
// 폐기)하기 전에 중단한다. onReauth: 자체 후처리(로컬 정리+랜딩)가 있으므로
// 회복 불능이어도 /login 으로 이동하지 않는다.
export const postLogout = (expectedSessionId: string, signal?: AbortSignal): Promise<null> =>
  request<null>("POST", "/api/v1/auth/logout", {
    bodyFactory: () => {
      const auth = getAuthSnapshot();
      if (!auth || auth.sessionId !== expectedSessionId) {
        throw new ApiError(FE_ERROR_CODES.SESSION_REPLACED, "세션이 변경되었습니다.", 401);
      }
      return { refreshToken: auth.refreshToken };
    },
    onReauth: "silent",
    signal,
  });

export const fetchProfile = (): Promise<Profile> => delay(fixtures.profile);

export const fetchSubscription = (): Promise<Subscription> => delay(fixtures.subscription);

export const fetchNotifications = (): Promise<NotificationItem[]> => delay(fixtures.notifications);

/* ---------- 이력서 (실제 API — orval 생성 fetcher 사용) ----------
   경로·파라미터·타입은 src/api/generated/ 의 생성 코드가 원천이다.
   스펙 변경 시 `pnpm orval` 로 재생성 (BE 서버 실행 중이어야 함).
   여기서는 생성 fetcher 호출 + 엔벨로프 언래핑 + UI 모델 매핑만 담당한다. */

export type ResumeSummary = ResumeSummaryResponse;
export type ResumeUploadResponse = ResumeUploadResponseModel;
export type ResumeParsedResponse = ResumeParsedResponseModel;
export type ResumeReanalyzeResponse = ResumeReanalyzeResponseModel;
export type AnalysisStatus = ResumeSummaryResponseAnalysisStatus;
export type StructuredData = StructuredDataModel;

/** 백엔드 8단계 상태 → UI 3분류. EMBEDDED만 완료 — PARSED는 색인 전이라 아직 면접에 못 쓴다. */
export function toUiStatus(status: AnalysisStatus): ResumeStatus {
  if (status === "EMBEDDED") return "done";
  if (status === "FAILED") return "fail";
  return "ing";
}

/** 진행률 표시용 매핑 — 서버는 progress를 내려주지 않는다(PRD §3, 프론트 소관).
    파이프라인 단계 순서에 따른 대략치로, 단계 소요 시간과 무관한 표시용 값이다. */
export const ANALYSIS_PROGRESS: Record<AnalysisStatus, number> = {
  UPLOADED: 10,
  PARSING: 30,
  TEXT_EXTRACTING: 50,
  STRUCTURING: 65,
  PARSED: 80,
  EMBEDDING: 90,
  EMBEDDED: 100,
  FAILED: 0,
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

const formatRelative = (iso: string, now: Date): string => {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return formatDate(iso);
};

/** 목록 응답 항목 → UI 모델. now는 상대 시각("2일 전") 계산 기준 — 테스트에서 고정 주입. */
export function toUiResume(summary: ResumeSummary, now: Date = new Date()): Resume {
  const status = summary.analysisStatus ?? "UPLOADED";
  const uiStatus = toUiStatus(status);
  const createdAt = summary.createdAt ?? now.toISOString();
  return {
    id: summary.resumeId ?? 0,
    name: summary.title ?? "",
    ext: "PDF", // 백엔드가 PDF만 허용(R002) — 파일 형식은 고정
    meta: `${formatBytes(summary.fileSize ?? 0)} · ${formatRelative(createdAt, now)}`,
    uploadedAt: formatDate(createdAt),
    status: uiStatus,
    ...(uiStatus === "ing" ? { progress: ANALYSIS_PROGRESS[status] } : {}),
  };
}

/** UI에 페이지네이션이 없어 상한(size=100)까지 한 번에 조회한다 — MVP 가정(1인당 이력서 소수).
    초과분은 잘리므로 페이지네이션 UI 도입 시 이 가정을 함께 걷어낼 것. */
export const fetchResumes = async (): Promise<Resume[]> => {
  const page = (await getList({ size: 100 })).data;
  const now = new Date();
  // resumeId 없는 항목은 제외 — id는 삭제·재분석의 path parameter라 폴백(0)으로 채우면 위험하다
  return (page?.content ?? [])
    .filter((s) => s.resumeId !== undefined)
    .map((s) => toUiResume(s, now));
};

export const uploadResume = async (
  file: File,
  title?: string,
): Promise<ResumeUploadResponse | undefined> =>
  (await upload({ file }, title !== undefined ? { title } : undefined)).data;

export const deleteResume = async (resumeId: number): Promise<void> => {
  await deleteResumeApi(resumeId);
};

export const reanalyzeResume = async (
  resumeId: number,
): Promise<ResumeReanalyzeResponse | undefined> => (await reanalyze(resumeId)).data;

/** 파싱 결과 원본 조회 — 상세 표시와 수정 폼 초기값이 같은 structuredData 를 쓰므로
    매핑 없이 그대로 반환한다 (표시는 화면 소관). */
export const fetchResumeParsed = async (resumeId: number): Promise<ResumeParsedResponse> =>
  (await getParsed(resumeId)).data ?? {};

/** 파싱 결과 수정 — 저장만 된다. 면접 질문 생성에 반영하려면 재분석(REINDEX)이 필요하다 (PRD §4). */
export const updateResumeParsed = async (
  resumeId: number,
  structuredData: StructuredData,
): Promise<ResumeParsedResponse> => (await updateParsed(resumeId, { structuredData })).data ?? {};

/* ---------- 리포트 (실제 API) ---------- */

/** 리포트 API에 면접 유형 필드가 없어 태그 자리를 채우는 임시 목값.
    태그 필요성 검토 후 백엔드 연동 또는 제거 예정 (결정: 2026-08-03 목값 유지). */
const MOCK_INTERVIEW_TYPE = "실전 30분";

/** 백엔드 리포트 응답 계약 — 매핑 원본. 화면은 이 형태를 직접 쓰지 않는다(UI 모델로 변환). */
interface WeaknessTagCountRes {
  tag: string;
  count: number;
}
interface AxisScoresRes {
  logicScore: number | null;
  specificityScore: number | null;
  technicalAccuracyScore: number | null;
  deliveryScore: number | null; // 음성 분석 도입 전까지 항상 null
}
interface ReportSummaryRes {
  reportId: number;
  status: ReportStatus;
  overallScore: number | null;
  resumeFileName: string;
  weaknessTagSummary: WeaknessTagCountRes[] | null;
  createdAt: string;
  completedAt: string | null;
}
interface ReportStatsRes {
  totalCount: number;
  avgScore: number | null;
  bestScore: number | null;
  monthlyDelta: number | null;
  trend: { completedAt: string; overallScore: number | null }[];
  axisAverages: AxisScoresRes;
  weaknessSegments: WeaknessTagCountRes[];
}
interface ReportDetailRes {
  reportId: number;
  resumeFileName: string;
  completedAt: string | null;
  overallScore: number | null;
  scores: AxisScoresRes;
  questionCount: number;
  summary: string;
  weaknessTagSummary: WeaknessTagCountRes[] | null;
  improvementTasks: { title: string; description: string }[] | null;
  aiDisclaimer: string;
}
interface PageRes<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  hasNext: boolean;
}

/** 추이 축 라벨("6.03") — 월은 패딩 없음, 일은 두 자리 (fixtures 표기 관례 유지) */
const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
};

/** 파일명 확장자 → UI 뱃지. 백엔드는 PDF만 허용(R002)하지만 표기는 파일명 기준으로 둔다. */
const extOf = (fileName: string): "PDF" | "DOC" => (/\.docx?$/i.test(fileName) ? "DOC" : "PDF");

/** 축 점수 객체 → UI 튜플. 전달력(delivery)은 null을 유지해 화면이 "음성 분석 예정"으로 처리한다. */
const toAxisPairs = (s: AxisScoresRes): [string, number | null][] => [
  ["논리 구성", s.logicScore],
  ["답변 구체성", s.specificityScore],
  ["기술 정확도", s.technicalAccuracyScore],
  ["전달력", s.deliveryScore],
];

/** 지난달 대비 표시 — 비교 불가(null)면 빈 문자열, 그 외 부호를 붙인다. */
const formatMonthlyDelta = (delta: number | null): string =>
  delta === null || delta === undefined ? "" : `지난달 대비 ${delta >= 0 ? "+" : ""}${delta}`;

/** 가장 잦은 약점 태그명 — 빈도 내림차순 첫 항목(없으면 빈 문자열). */
const topWeaknessTag = (tags: WeaknessTagCountRes[]): string =>
  tags.length === 0 ? "" : [...tags].sort((a, b) => b.count - a.count)[0].tag;

const toUiReport = (r: ReportSummaryRes): ReportSummary => ({
  id: r.reportId,
  status: r.status,
  date: formatDate(r.completedAt ?? r.createdAt),
  score: r.overallScore, // 미완성이면 null — 화면이 "생성 중"으로 표시
  title: r.resumeFileName, // 리포트에 별도 제목이 없어 사용 이력서명을 제목으로 쓴다
  resumeName: r.resumeFileName,
  resumeExt: extOf(r.resumeFileName),
  type: MOCK_INTERVIEW_TYPE,
  tags: (r.weaknessTagSummary ?? []).map((w) => w.tag),
});

export const fetchReports = async (params: ReportListParams): Promise<ReportPage> => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status); // 미지정은 전체(파라미터 생략)
  qs.set("sort", params.sort);
  qs.set("order", params.order);
  qs.set("page", String(params.page));
  qs.set("size", String(params.size));
  const page = await request<PageRes<ReportSummaryRes>>("GET", `/api/v1/reports?${qs}`);
  return {
    items: page.content.map(toUiReport),
    page: page.page,
    size: page.size,
    totalElements: page.totalElements,
    hasNext: page.hasNext,
  };
};

export const fetchReportStats = async (): Promise<ReportStats> => {
  const s = await request<ReportStatsRes>("GET", "/api/v1/reports/stats");
  return {
    avgScore: s.avgScore,
    avgDelta: formatMonthlyDelta(s.monthlyDelta),
    totalCount: s.totalCount,
    bestScore: s.bestScore,
    // 점수 없는 항목은 추이에서 제외한다 — 0으로 치환하면 차트 범위(55~90) 밖 급락으로 오해된다.
    // (백엔드 trend는 완료 리포트만 담아 실제로는 비어 있지 않지만, 타입상 null을 방어한다)
    trend: s.trend
      .filter((t): t is { completedAt: string; overallScore: number } => t.overallScore !== null)
      .map((t) => ({ d: formatShortDate(t.completedAt), s: t.overallScore })),
    axisAverages: toAxisPairs(s.axisAverages),
    weaknessSegments: s.weaknessSegments.map((w) => [w.tag, w.count]),
  };
};

export const fetchReportDetail = async (id: number | string): Promise<ReportDetail> => {
  const d = await request<ReportDetailRes>("GET", `/api/v1/reports/${id}`);
  const weakness = d.weaknessTagSummary ?? [];
  return {
    id: d.reportId,
    date: formatDate(d.completedAt ?? new Date().toISOString()),
    resumeName: d.resumeFileName,
    type: MOCK_INTERVIEW_TYPE,
    score: d.overallScore,
    summary: d.summary,
    questionCount: d.questionCount,
    axes: toAxisPairs(d.scores),
    weaknesses: weakness.map((w) => [w.tag, w.count, d.questionCount]),
    weaknessSummary: topWeaknessTag(weakness),
    tasks: (d.improvementTasks ?? []).map((t) => [t.title, t.description]),
    aiDisclaimer: d.aiDisclaimer,
  };
};

interface TimelineItemRes {
  questionNumber: number;
  questionType: string; // MAIN | TAIL
  parentQuestionNumber: number | null;
  question: string;
  answer: string;
  evaluation: {
    logicScore: number | null;
    specificityScore: number | null;
    technicalAccuracyScore: number | null;
    feedback: string;
    weaknessTags: string[] | null;
  } | null;
}

/** 질문-답변 타임라인 — 상세와 독립(병렬 호출 가능). COMPLETED 리포트만, 페이지네이션 없음. */
export const fetchReportTimeline = async (id: number | string): Promise<TimelineEntry[]> => {
  const data = await request<{ items: TimelineItemRes[] }>("GET", `/api/v1/reports/${id}/timeline`);
  return data.items.map((it) => ({
    questionNumber: it.questionNumber,
    isTail: it.questionType === "TAIL",
    parentQuestionNumber: it.parentQuestionNumber,
    question: it.question,
    answer: it.answer,
    evaluation: it.evaluation
      ? {
          logicScore: it.evaluation.logicScore,
          specificityScore: it.evaluation.specificityScore,
          technicalAccuracyScore: it.evaluation.technicalAccuracyScore,
          feedback: it.evaluation.feedback,
          weaknessTags: it.evaluation.weaknessTags ?? [],
        }
      : null,
  }));
};

/* ---------- 면접 세션 (실제 API — orval 생성 fetcher 사용) ---------- */

export type CreateSessionResponse = InterviewSessionCreateResponse;

/** 면접 세션 생성 — 요청 계약(types.ts)과 생성 요청 타입의 구조 일치는 컴파일이 보증한다.
    응답 필드 검증·저장은 화면(SetupPage) 책임 */
export const createInterviewSession = async (
  body: CreateSessionRequest,
): Promise<CreateSessionResponse> => (await createSessionApi(body)).data ?? {};
