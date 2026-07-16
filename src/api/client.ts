/* ============================================================
   API 클라이언트 — 도메인별로 목 → 실제 API 점진 교체 중.
   [실제] 인증(auth)  [목] 이력서·리포트·사용자·알림
   ============================================================ */
import * as fixtures from "./fixtures";
import { request } from "./request";
import type { components } from "./schema";
import type {
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

export const postKakaoLogin = (code: string): Promise<KakaoLoginResponse> =>
  request<KakaoLoginResponse>("POST", "/api/v1/auth/kakao", { body: { code } });

export const fetchProfile = (): Promise<Profile> => delay(fixtures.profile);

export const fetchSubscription = (): Promise<Subscription> => delay(fixtures.subscription);

export const fetchNotifications = (): Promise<NotificationItem[]> => delay(fixtures.notifications);

export const fetchResumes = (): Promise<Resume[]> => delay(fixtures.resumes);

export const fetchReports = (): Promise<ReportSummary[]> => delay(fixtures.reports);

export const fetchReportStats = (): Promise<ReportStats> => delay(fixtures.reportStats);

export const fetchReportDetail = (id: number | string): Promise<ReportDetail> =>
  delay({ ...fixtures.reportDetail, id: Number(id) || 1 });
