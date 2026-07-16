import { useQuery } from "@tanstack/react-query";
import {
  fetchNotifications,
  fetchProfile,
  fetchReportDetail,
  fetchReports,
  fetchReportStats,
  fetchResumes,
  fetchSubscription,
  postKakaoLogin,
} from "./client";

/* ---------- 인증 ---------- */

/** 카카오 code 교환 — code 는 1회용이라 재시도·재요청을 모두 차단한 쿼리.
    (mutate-in-effect 는 StrictMode 이중 마운트에서 상태 유실 — queryKey 캐시가 dedup 을 보장) */
export const useKakaoLogin = (code: string | null) =>
  useQuery({
    queryKey: ["auth", "kakaoLogin", code],
    queryFn: () => postKakaoLogin(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: Infinity,
  });

export const useProfile = () => useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

export const useSubscription = () =>
  useQuery({ queryKey: ["subscription"], queryFn: fetchSubscription });

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });

export const useResumes = () => useQuery({ queryKey: ["resumes"], queryFn: fetchResumes });

export const useReports = () => useQuery({ queryKey: ["reports"], queryFn: fetchReports });

export const useReportStats = () =>
  useQuery({ queryKey: ["reports", "stats"], queryFn: fetchReportStats });

export const useReportDetail = (id: number | string) =>
  useQuery({
    queryKey: ["reports", "detail", String(id)],
    queryFn: () => fetchReportDetail(id),
  });
