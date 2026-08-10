import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInterviewSession,
  deleteResume,
  endInterviewSession,
  fetchNotifications,
  fetchProfile,
  fetchReportDetail,
  fetchReports,
  fetchReportStats,
  fetchReportTimeline,
  fetchResumeParsed,
  fetchResumes,
  fetchSubscription,
  getConsentCatalog,
  postKakaoLogin,
  postLogout,
  postSignup,
  reanalyzeResume,
  reenterInterviewSession,
  regenerateReport,
  updateProfileName,
  updateResumeParsed,
  uploadResume,
} from "./client";
import type { StructuredData } from "./client";
import type { ReportListParams } from "./types";
import { clearSignupSession, clearTokens, getAuthSnapshot } from "./tokenStore";
import { useNav } from "../hooks/useNav";

/** 목록 조회 기본값 — 최신순 첫 페이지. 대시보드처럼 파라미터 없이 부를 때 쓰인다. */
export const DEFAULT_REPORT_PARAMS: ReportListParams = {
  sort: "createdAt",
  order: "desc",
  page: 0,
  size: 20,
};

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
      try {
        if (sessionId) await clearTokens(sessionId); // 내 세션일 때만 삭제 — 새 로그인 보호
      } catch {
        // 저장소·잠금 오류 — 로컬 삭제는 best-effort. 실패해도 아래 캐시 정리와
        // 랜딩 이동은 반드시 진행한다 (중단 시 이전 계정 화면·캐시에 갇힘)
      }
      clearSignupSession(); // 탭 로컬(sessionStorage) — 이전 가입 흐름의 임시 정보 폐기
      // 캐시는 무조건 비운다 — 이 탭의 캐시는 로그아웃한 세션의 데이터라,
      // 새 세션이 활성이어도 보존하면 이전 계정 데이터가 노출된다 (재조회만 발생)
      queryClient.clear();
      nav("landing");
    },
  });
};

export const useProfile = () => useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

/** 이름 수정 — PATCH 응답이 수정 결과 전체이므로 재조회 없이 캐시를 직접 교체한다 */
export const useUpdateProfileName = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfileName,
    onSuccess: (profile) => queryClient.setQueryData(["profile"], profile),
  });
};

export const useSubscription = () =>
  useQuery({ queryKey: ["subscription"], queryFn: fetchSubscription });

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });

/* ---------- 이력서 ---------- */

export const useResumes = () => useQuery({ queryKey: ["resumes"], queryFn: fetchResumes });

/** 분석 결과 미리보기 — 행을 펼친 시점에만 조회(목록 payload 경량화, PRD §2).
    409(분석 중 R010·실패 R011)는 상태가 바뀌기 전엔 반복해도 같은 결과라 재시도하지 않는다 */
export const useResumeParsed = (resumeId: number | null) =>
  useQuery({
    queryKey: ["resumes", "parsed", resumeId],
    queryFn: () => fetchResumeParsed(resumeId as number),
    enabled: resumeId !== null,
    retry: false,
  });

/** 업로드 — 성공(신규·중복 모두) 시 목록 재조회. 진행 상태 반영은 SSE 스토리(HBB1-271) 소관 */
export const useUploadResume = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => uploadResume(file, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });
};

export const useDeleteResume = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: number) => deleteResume(resumeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });
};

/** 파싱 결과 수정 — 저장만 된다(면접 반영은 재분석 필요, PRD §4).
    성공 시 resumes 무효화 — 접두사 매칭으로 미리보기(["resumes","parsed",id]) 캐시도 갱신된다 */
export const useUpdateResumeParsed = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      resumeId,
      structuredData,
    }: {
      resumeId: number;
      structuredData: StructuredData;
    }) => updateResumeParsed(resumeId, structuredData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });
};

/** 재분석 — 상태가 즉시 재시작 상태(UPLOADED/EMBEDDING)로 바뀌므로 목록 재조회 */
export const useReanalyzeResume = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: number) => reanalyzeResume(resumeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });
};

export const useReports = (params: ReportListParams = DEFAULT_REPORT_PARAMS) =>
  useQuery({
    // params 를 키에 실어 정렬·필터·페이지별로 캐시를 분리한다. SSE 무효화(["reports"])는 접두사 매칭이라 모두 갱신.
    queryKey: ["reports", params],
    queryFn: () => fetchReports(params),
  });

export const useReportStats = () =>
  useQuery({ queryKey: ["reports", "stats"], queryFn: fetchReportStats });

/** enabled=false 는 공개 예시(/sample)에서 인증 API 호출을 막고 정적 목데이터를 쓰기 위함이다. */
export const useReportDetail = (id: number | string, enabled = true) =>
  useQuery({
    queryKey: ["reports", "detail", String(id)],
    queryFn: () => fetchReportDetail(id),
    enabled,
  });

/** 리포트 재생성 — FAILED 리포트를 PENDING 으로 되돌린다 (자동 재시도 없음, 비멱등 POST).
    성공·실패 모두 목록을 재조회한다: 성공한 PENDING 복귀는 SSE 로 오지 않아 다른 갱신
    경로가 없고, 409(RP003/RP005)는 서버 상태가 화면보다 앞서 있다는 뜻이라 재동기화가 답이다. */
export const useRegenerateReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: number) => regenerateReport(reportId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });
};

/** 질문-답변 타임라인 — 상세와 독립 조회(병렬). enabled=false 는 /sample 정적 데이터용. */
export const useReportTimeline = (id: number | string, enabled = true) =>
  useQuery({
    queryKey: ["reports", "timeline", String(id)],
    queryFn: () => fetchReportTimeline(id),
    enabled,
  });

/** 면접 세션 생성 — 룸·토큰을 발급하는 비멱등 POST 라 mutation
    (자동 재시도 없음, isPending 으로 이중 제출 방지) */
export const useCreateInterviewSession = () => useMutation({ mutationFn: createInterviewSession });

/** 면접 세션 종료 — 멱등 202 수리 응답. 재호출이 안전한 복구 경로라 화면의
    명시 재시도 버튼으로 재실행한다 (자동 재시도는 두지 않음) */
export const useEndInterviewSession = () => useMutation({ mutationFn: endInterviewSession });

/** 면접 재입장 토큰 재발급 — 목(BE 재연결 PRD 확정 대기). 시도 스케줄·단일 진행은
    재입장 오케스트레이션 훅이 관리하므로 여기엔 자동 재시도를 두지 않는다 */
export const useReenterInterviewSession = () =>
  useMutation({ mutationFn: reenterInterviewSession });
