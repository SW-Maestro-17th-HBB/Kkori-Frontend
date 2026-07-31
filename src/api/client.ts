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
  ReportStats,
  ReportSummary,
  Resume,
  ResumeStatus,
  Subscription,
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

export const fetchReports = (): Promise<ReportSummary[]> => delay(fixtures.reports);

export const fetchReportStats = (): Promise<ReportStats> => delay(fixtures.reportStats);

export const fetchReportDetail = (id: number | string): Promise<ReportDetail> =>
  delay({ ...fixtures.reportDetail, id: Number(id) || 1 });

/* ---------- 면접 세션 (실제 API — orval 생성 fetcher 사용) ---------- */

export type CreateSessionResponse = InterviewSessionCreateResponse;

/** 면접 세션 생성 — 요청 계약(types.ts)과 생성 요청 타입의 구조 일치는 컴파일이 보증한다.
    응답 필드 검증·저장은 화면(SetupPage) 책임 */
export const createInterviewSession = async (
  body: CreateSessionRequest,
): Promise<CreateSessionResponse> => (await createSessionApi(body)).data ?? {};
