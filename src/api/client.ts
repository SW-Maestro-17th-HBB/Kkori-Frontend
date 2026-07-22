/* ============================================================
   API 클라이언트 — 도메인별로 목 → 실제 API 점진 교체 중.
   [실제] 인증(auth)·이력서(resume)  [목] 리포트·사용자·알림
   ============================================================ */
import * as fixtures from "./fixtures";
import { ApiError, FE_ERROR_CODES, request } from "./request";
import type { components } from "./schema";
import { getAuthSnapshot } from "./tokenStore";
import type {
  LiveKitSession,
  NotificationItem,
  Profile,
  ReportDetail,
  ReportStats,
  ReportSummary,
  Resume,
  ResumePreview,
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

/* ---------- 이력서 (실제 API) ---------- */

export type ResumeSummary = components["schemas"]["ResumeSummaryResponse"];
export type ResumePageResponse = components["schemas"]["PageResponseResumeSummaryResponse"];
export type ResumeUploadResponse = components["schemas"]["ResumeUploadResponse"];
export type ResumeParsedResponse = components["schemas"]["ResumeParsedResponse"];
export type ResumeReanalyzeResponse = components["schemas"]["ResumeReanalyzeResponse"];
export type AnalysisStatus = NonNullable<ResumeSummary["analysisStatus"]>;

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

/** 파싱 결과 → 미리보기 표시 모델. 필드 누락·빈 배열은 계약상 허용이라 전부 방어한다. */
export function toResumePreview(parsed: ResumeParsedResponse): ResumePreview {
  const sd = parsed.structuredData;
  return {
    name: sd?.profile?.name ?? "-",
    career: sd?.experiences?.[0]?.title ?? "-",
    skills: (sd?.skills ?? []).flatMap((s) => s.items ?? []),
    projects:
      (sd?.projects ?? [])
        .map((p) => p.name)
        .filter(Boolean)
        .join(", ") || "-",
  };
}

/** UI에 페이지네이션이 없어 상한(size=100)까지 한 번에 조회한다 — MVP 가정(1인당 이력서 소수).
    초과분은 잘리므로 페이지네이션 UI 도입 시 이 가정을 함께 걷어낼 것. */
export const fetchResumes = async (): Promise<Resume[]> => {
  const page = await request<ResumePageResponse>("GET", "/api/v1/resumes?size=100");
  const now = new Date();
  return (page.content ?? []).map((s) => toUiResume(s, now));
};

export const uploadResume = (file: File, title?: string): Promise<ResumeUploadResponse> => {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  return request<ResumeUploadResponse>("POST", "/api/v1/resumes", { body: form });
};

export const deleteResume = (resumeId: number): Promise<null> =>
  request<null>("DELETE", `/api/v1/resumes/${resumeId}`);

export const reanalyzeResume = (resumeId: number): Promise<ResumeReanalyzeResponse> =>
  request<ResumeReanalyzeResponse>("POST", `/api/v1/resumes/${resumeId}/reanalyze`);

export const fetchResumeParsed = async (resumeId: number): Promise<ResumePreview> =>
  toResumePreview(await request<ResumeParsedResponse>("GET", `/api/v1/resumes/${resumeId}/parsed`));

export const fetchReports = (): Promise<ReportSummary[]> => delay(fixtures.reports);

export const fetchReportStats = (): Promise<ReportStats> => delay(fixtures.reportStats);

export const fetchReportDetail = (id: number | string): Promise<ReportDetail> =>
  delay({ ...fixtures.reportDetail, id: Number(id) || 1 });

/* ---------- LiveKit (목 — env 임시 토큰) ---------- */

/** LiveKit 접속 세션 — 백엔드 토큰 발급 API(스키마 미정)가 생기면 request() 호출로 교체.
    그 전까지는 .env.local 의 개발용 URL·토큰을 반환한다 */
export const fetchLiveKitSession = (): Promise<LiveKitSession> => {
  // dev 전용 경로 — VITE_* 값은 번들에 그대로 박히므로, 배포 환경에 토큰이
  // 설정되면 모든 방문자가 같은 룸 권한을 공유하게 된다. 프로덕션 번들에서 차단.
  if (!import.meta.env.DEV) {
    return Promise.reject(new Error("LiveKit 접속은 아직 개발 환경에서만 지원됩니다."));
  }
  const url = import.meta.env.VITE_LIVEKIT_URL;
  const token = import.meta.env.VITE_LIVEKIT_TOKEN;
  if (!url || !token) {
    return Promise.reject(
      new Error("LiveKit 접속 정보가 없습니다 — .env.local 에 VITE_LIVEKIT_URL/TOKEN 설정 필요"),
    );
  }
  return delay({ url, token });
};
