import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  postLogout,
  postSignup,
} from "./client";
import { clearSignupSession, clearTokens, getAuthSnapshot } from "./tokenStore";
import { useNav } from "../hooks/useNav";

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

/** 로그아웃 서버 폐기 대기 상한 — best-effort 라 초과 시 끊고 로컬 로그아웃을 마친다.
    (객체 seam — 테스트에서 상한을 줄여 실타이머로 결정적으로 검증) */
export const LOGOUT_TIMEOUT = { ms: 5000 };

/** 로그아웃 — 서버 RT 폐기(멱등)를 시도하고, 결과와 무관하게 로컬 세션을 정리한 뒤 랜딩으로.
    화면은 이 훅만 쓰면 되고 storage 를 직접 만지지 않는다 (저장 전략 교체 대비 격리) */
export const useLogout = () => {
  const nav = useNav();
  const queryClient = useQueryClient();
  return useMutation({
    // 시작 시점의 세션 ID 를 반환해 정리 단계로 전달 — 요청 대기 중 다른 탭에서
    // 새 계정이 로그인했으면 그 세션을 지우면 안 되기 때문 (조건부 삭제)
    mutationFn: async (): Promise<string | null> => {
      const auth = getAuthSnapshot();
      if (!auth) return null; // 이미 로그아웃 상태 — API 생략
      // best-effort 서버 폐기 — 응답이 안 오면 상한 후 요청을 끊고 로컬 로그아웃을 완료한다
      // (무한 대기 시 onSettled 가 오지 않아 토큰 정리·이동이 전부 멈춤)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT.ms);
      try {
        await postLogout(auth.sessionId, controller.signal); // 소유 세션 전달 — 교체 시 전송 전 중단
      } catch {
        // 멱등 계약 — 서버 폐기가 실패·시간 초과해도 로컬 정리는 진행한다
      } finally {
        clearTimeout(timer);
      }
      return auth.sessionId;
    },
    onSettled: async (sessionId) => {
      if (sessionId) await clearTokens(sessionId); // 내 세션일 때만 삭제 — 새 로그인 보호
      clearSignupSession(); // 탭 로컬(sessionStorage) — 이전 가입 흐름의 임시 정보 폐기
      // 캐시는 무조건 비운다 — 이 탭의 캐시는 로그아웃한 세션의 데이터라,
      // 새 세션이 활성이어도 보존하면 이전 계정 데이터가 노출된다 (재조회만 발생)
      queryClient.clear();
      nav("landing");
    },
  });
};

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
