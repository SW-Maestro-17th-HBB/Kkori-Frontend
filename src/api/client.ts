/* ============================================================
   API 클라이언트 — 도메인별로 목 → 실제 API 점진 교체 중.
   [실제] 인증(auth)  [목] 이력서·리포트·사용자·알림
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

export const fetchResumes = (): Promise<Resume[]> => delay(fixtures.resumes);

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
