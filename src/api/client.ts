/* ============================================================
   API 클라이언트 — 현재는 목 fetcher.
   백엔드 연동 시 이 파일의 함수 본문만 실제 fetch로 교체.
   ============================================================ */
import * as fixtures from "./fixtures";
import type {
  NotificationItem,
  Profile,
  ReportDetail,
  ReportStats,
  ReportSummary,
  Resume,
  Subscription,
} from "./types";

const delay = <T,>(data: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

export const fetchProfile = (): Promise<Profile> => delay(fixtures.profile);

export const fetchSubscription = (): Promise<Subscription> =>
  delay(fixtures.subscription);

export const fetchNotifications = (): Promise<NotificationItem[]> =>
  delay(fixtures.notifications);

export const fetchResumes = (): Promise<Resume[]> => delay(fixtures.resumes);

export const fetchReports = (): Promise<ReportSummary[]> =>
  delay(fixtures.reports);

export const fetchReportStats = (): Promise<ReportStats> =>
  delay(fixtures.reportStats);

export const fetchReportDetail = (id: number | string): Promise<ReportDetail> =>
  delay({ ...fixtures.reportDetail, id: Number(id) || 1 });
