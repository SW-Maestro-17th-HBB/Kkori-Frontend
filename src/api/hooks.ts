import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchNotifications,
  fetchProfile,
  fetchReportDetail,
  fetchReports,
  fetchReportStats,
  fetchResumes,
  fetchSubscription,
  getConsentCatalog,
  postKakaoLogin,
  postSignup,
} from "./client";

/* ---------- 인증 ---------- */

/** 카카오 code 교환 — code 는 1회용이라 재시도·재요청을 모두 차단한 쿼리.
    (mutate-in-effect 는 StrictMode 이중 마운트에서 상태 유실 — queryKey 캐시가 dedup 을 보장)
    refetch 3종도 차단 — 탭 포커스/재연결/재마운트로 소진된 code 가 재전송되면 안 됨 */
export const useKakaoLogin = (code: string | null) =>
  useQuery({
    queryKey: ["auth", "kakaoLogin", code],
    queryFn: () => postKakaoLogin(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

/** 동의 항목 카탈로그 — 제출 시 반향할 버전의 원천이라 캐시 재사용 금지(staleTime 0).
    gcTime 은 기본값 유지 — 0 이면 StrictMode 이중 마운트에서 dedup 이 깨져 중복 fetch.
    포커스·재연결 자동 재조회는 차단 — 백그라운드 갱신으로 카탈로그가 조용히 개정판으로
    바뀌면 기존 체크가 새 버전에 승계되어, 확인한 적 없는 문안에 동의한 증적이 남는다.
    개정 반영은 U005 처리(체크 리셋 + 명시적 refetch)로만 이뤄져야 한다 */
export const useConsentCatalog = (enabled = true) =>
  useQuery({
    queryKey: ["consents", "catalog"],
    queryFn: getConsentCatalog,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

/** 가입/복구 제출 — 계정을 생성하는 비멱등 POST 라 mutation (자동 재시도 없음, isPending 으로 이중 제출 방지) */
export const useSignup = () => useMutation({ mutationFn: postSignup });

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
