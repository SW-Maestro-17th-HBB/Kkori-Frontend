/* ============================================================
   공통 API 클라이언트 레이어
   백엔드 엔벨로프 계약(ApiResponse<T>) 기준으로 언래핑·에러 변환을 담당.
   - 성공: { success: true, data }  → data 반환
   - 실패: { success: false, error: { code, message, fieldErrors } } → ApiError throw
   - HTTP 상태코드는 바디에 없음 — 상태줄이 유일 원천, 구분은 비즈니스 code

   토큰 수명 관리(HBB1-251)도 이 파일이 전담한다:
   - 보호 요청에 Authorization: Bearer {AT} 자동 부착 (공개 요청 목록 제외)
   - 보호 요청 401 → /auth/reissue(single-flight) → 원 요청 정확히 1회 재시도
   - 회복 불능(재로그인 필요 코드) → 로컬 세션 정리 + /login 이동
   client.ts 의 fetcher 들이 이 request() 로 교체되며 화면 코드는 불변.
   ============================================================ */
import { REAUTH_REQUIRED_CODES } from "./errorCodes";
import type { components } from "./schema";
import {
  clearSignupSession,
  clearTokens,
  getAccessToken,
  getAuthSessionId,
  getAuthSnapshot,
  rotateTokens,
} from "./tokenStore";
import { ROUTES } from "../routes";

/** 검증 실패 시 필드 단위 에러 (백엔드 FieldError) */
export interface FieldError {
  field?: string;
  reason?: string;
}

/** 백엔드 ApiResponse<T> 엔벨로프 (schema.ts 의 ApiResponse* 와 동일 형태) */
interface ApiEnvelope<T> {
  success?: boolean;
  data?: T | null;
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: FieldError[];
  } | null;
}

/** 프론트에서 합성하는 에러 코드 — 백엔드 code(C001 등)와 구분되도록 FE_ 접두사 */
export const FE_ERROR_CODES = {
  /** 서버 응답이 엔벨로프 계약과 다름 (프록시 오류 페이지, 비 JSON 등) */
  INVALID_RESPONSE: "FE_INVALID_RESPONSE",
  /** 네트워크 실패 — 서버에 도달하지 못함 */
  NETWORK: "FE_NETWORK",
  /** 세션 회복 불능 — RT 부재 또는 재발급 응답의 토큰 쌍 누락 */
  SESSION_EXPIRED: "FE_SESSION_EXPIRED",
  /** 재발급 도중 인증 세션이 교체됨(다른 계정 로그인 등) — 회전 결과 폐기, 세션은 건드리지 않음 */
  SESSION_REPLACED: "FE_SESSION_REPLACED",
} as const;

/**
 * API 호출 실패를 나타내는 단일 에러 타입.
 * code 는 백엔드 비즈니스 코드(src/api/errorCodes.ts) 또는 FE_ERROR_CODES.
 */
export class ApiError extends Error {
  readonly code: string;
  /** HTTP 상태코드. 네트워크 실패 등 응답 자체가 없으면 0 */
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(code: string, message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** 비어 있으면 same-origin — 로컬 개발은 vite.config.ts 의 프록시(/api, /sse → 8080)를 탄다 */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** 세션 회복 불능 시 처리 — 자체 후처리(로컬 정리+랜딩)가 있는 로그아웃만 "silent" */
type ReauthPolicy = "redirect" | "silent";

interface RequestOptionsBase {
  signal?: AbortSignal;
  /** HTTP 캐시 모드 — 캐시 재사용이 계약 위반인 조회(동의 카탈로그 등)는 "no-store" 지정 */
  cache?: RequestCache;
  onReauth?: ReauthPolicy;
}

/** body 는 정적 값 또는 매 시도 직전에 평가되는 팩토리 — 동시 지정은 타입으로 금지.
    재발급으로 토큰이 회전된 뒤의 재시도가 최신 값을 실어야 하는 요청(로그아웃의 RT)은
    bodyFactory 를 사용한다. 객체는 JSON 직렬화, FormData 는 그대로 전송. */
type RequestOptions = RequestOptionsBase &
  ({ body?: unknown; bodyFactory?: never } | { body?: never; bodyFactory?: () => unknown });

/** 엔벨로프 언래핑까지 담당하는 저수준 호출 — 토큰 부착은 인자로만 결정(재발급 로직 없음) */
async function rawRequest<T>(
  method: Method,
  path: string,
  opts: RequestOptions,
  accessToken: string | null,
): Promise<T> {
  const body = opts.bodyFactory ? opts.bodyFactory() : opts.body;
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: opts.signal,
      cache: opts.cache,
    });
  } catch (e) {
    // 중단(abort)은 호출자의 의도이므로 그대로 전파
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(FE_ERROR_CODES.NETWORK, "서버에 연결할 수 없습니다.", 0);
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = await res.json();
  } catch {
    throw new ApiError(
      FE_ERROR_CODES.INVALID_RESPONSE,
      `서버 응답을 해석할 수 없습니다. (HTTP ${res.status})`,
      res.status,
    );
  }

  if (envelope?.success === true) {
    // HTTP 상태줄이 유일 원천 — 비-2xx 인데 success 면 계약 위반이므로 성공 처리하지 않는다
    if (!res.ok) {
      throw new ApiError(
        FE_ERROR_CODES.INVALID_RESPONSE,
        `서버 응답이 계약과 다릅니다. (HTTP ${res.status})`,
        res.status,
      );
    }
    // 무내용 응답(ApiResponseVoid)은 data: null — 호출부가 T 를 void/null 로 선언
    return envelope.data as T;
  }

  if (envelope?.success === false) {
    const err = envelope.error;
    throw new ApiError(
      err?.code ?? FE_ERROR_CODES.INVALID_RESPONSE,
      err?.message ?? `요청에 실패했습니다. (HTTP ${res.status})`,
      res.status,
      err?.fieldErrors ?? [],
    );
  }

  // success 필드 자체가 없음 — 엔벨로프 계약 위반 (게이트웨이 오류 등)
  throw new ApiError(
    FE_ERROR_CODES.INVALID_RESPONSE,
    `서버 응답이 예상 형식이 아닙니다. (HTTP ${res.status})`,
    res.status,
  );
}

/* ---------- 토큰 부착·자동 재발급 (HBB1-251) ---------- */

const REISSUE_PATH = "/api/v1/auth/reissue";

/** FE API 클라이언트가 호출하는 공개 요청 목록 — AT 미부착 + 재발급 인터셉트 대상 아님.
    (백엔드 SecurityConfig 의 permitAll 중 FE 가 부르는 것과 일치. consents 는 GET 만 공개)
    stale 토큰이 남아 있어도 가입 플로우의 A005 처리(ConsentPage)를 가로채지 않기 위한 분류. */
const PUBLIC_REQUESTS: ReadonlySet<string> = new Set([
  "POST /api/v1/auth/kakao",
  "POST /api/v1/auth/signup",
  `POST ${REISSUE_PATH}`,
  "GET /api/v1/consents",
]);

/** Router 밖에서의 강제 이동 seam — 하드 리다이렉트로 캐시·메모리 상태까지 초기화.
    (jsdom 은 location.assign 미구현 — 테스트는 이 seam 을 스파이) */
export const hardRedirect = {
  to: (url: string) => window.location.assign(url),
};

/** 진행 중 재발급 — **세션별로 바인딩**해 동일 세션의 대기자만 결과를 공유한다.
    (A 세션의 재발급 실패를 B 세션 요청이 자기 실패로 오인하거나, 슬롯 교체로
    같은 세션의 재발급이 중복 시작되는 사고 방지) */
const reissueInFlight = new Map<string | null, Promise<void>>();
/** 강제 이동 1회 보장 — 동시 실패한 대기자들이 중복 이동하지 않도록.
    하드 리다이렉트로 페이지가 리셋되므로 실환경에선 자연 초기화된다. */
let reauthHandled = false;

/** 테스트 전용 — 모듈 상태 격리용 */
export function __resetAuthForTests() {
  reissueInFlight.clear();
  reauthHandled = false;
}

/** 세션 회복 불능 확정 시 처리 — 잠금 안에서 세션을 대조해 **그 세션이 아직 현재일 때만**
    정리·이동한다(그 사이 다른 계정이 로그인했으면 남의 세션이므로 아무것도 안 함).
    silent 정책은 이동하지 않고 가드도 점유하지 않는다. */
async function applyReauth(policy: ReauthPolicy, expectedSessionId: string | null): Promise<void> {
  const cleared = await clearTokens(expectedSessionId);
  if (!cleared) return; // 세션이 이미 교체됨 — 삭제·이동·정리 전부 생략
  clearSignupSession();
  if (policy === "redirect" && !reauthHandled) {
    reauthHandled = true;
    hardRedirect.to(ROUTES.auth);
  }
}

/** 재발급 실패의 회복 불능 판정 — 명세가 지정한 코드 계약(REAUTH_REQUIRED_CODES) + FE 합성 코드.
    네트워크·5xx 는 일시 장애일 수 있어 세션을 파괴하지 않는다(토큰 유지, 에러 전파). */
function isTerminalReissueFailure(e: unknown): boolean {
  return (
    isApiError(e) &&
    ((REAUTH_REQUIRED_CODES as readonly string[]).includes(e.code) ||
      e.code === FE_ERROR_CODES.SESSION_EXPIRED)
  );
}

/** 결과가 불확실한 실패 — 서버가 회전을 마쳤는데 응답만 유실됐을 수 있는 경우 */
function isUncertainFailure(e: unknown): boolean {
  return (
    isApiError(e) &&
    (e.code === FE_ERROR_CODES.NETWORK ||
      e.code === FE_ERROR_CODES.INVALID_RESPONSE ||
      e.status >= 500)
  );
}

type TokenPair = components["schemas"]["TokenResponse"];

/** 재발급 본체 — 정책 무관(이동하지 않음), 성공 시 회전된 쌍 저장.
    회전 성공+응답 유실이면 백엔드 Grace(60초)가 동일 RT 재시도에 원래 발급한 쌍을
    돌려주므로, 불확실 실패는 같은 RT 로 정확히 1회 재시도한다(명시적 401 은 즉시 전파).
    토큰 누락은 예외가 아닌 루프 내 데이터 검증으로 다루며, SESSION_EXPIRED 는
    ① RT 부재(사전) ② 시도 소진 시 마지막 실패가 누락일 때 — 두 지점에서만 생성. */
async function doReissue(expectedSessionId: string | null): Promise<void> {
  // 단일 스냅샷으로 캡처 — RT 와 세션 ID 가 서로 다른 세션의 것일 수 없다
  const auth = getAuthSnapshot();
  if (!auth) {
    throw new ApiError(FE_ERROR_CODES.SESSION_EXPIRED, "다시 로그인해 주세요.", 401);
  }
  if (auth.sessionId !== expectedSessionId) {
    // 요청한 세션이 이미 교체됨 — 남의 RT 로 재발급하지 않는다 (비 terminal)
    throw new ApiError(FE_ERROR_CODES.SESSION_REPLACED, "세션이 변경되었습니다.", 401);
  }
  const { refreshToken, sessionId } = auth; // 지역 고정 — 재시도도 같은 RT (Grace 계약)
  let lastUncertain: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let data: TokenPair;
    try {
      data = await rawRequest<TokenPair>(
        "POST",
        REISSUE_PATH,
        { body: { refreshToken } },
        null, // RT 가 곧 자격증명 — Bearer 미부착 (계약)
      );
    } catch (e) {
      if (!isUncertainFailure(e)) throw e; // 명시적 401(A007/A008/A009) 등 — 재시도 없이 전파
      lastUncertain = e;
      continue;
    }
    if (data?.accessToken && data?.refreshToken) {
      // 회전 저장은 탭 간 잠금 안에서 세션 재확인 후 수행(tokenStore.rotateTokens).
      // 대기 중 세션이 교체됐으면(다른 계정 로그인) 결과를 폐기 — 비 terminal 코드라
      // REAUTH 를 유발하지 않아 새 세션은 그대로 보존된다.
      const stored = await rotateTokens(data.accessToken, data.refreshToken, sessionId);
      if (!stored) {
        throw new ApiError(FE_ERROR_CODES.SESSION_REPLACED, "세션이 변경되었습니다.", 401);
      }
      return;
    }
    // 200 인데 토큰 쌍 누락 — 계약 위반이지만 응답 유실과 동급의 불확실 실패로 취급해 재시도
    lastUncertain = new ApiError(FE_ERROR_CODES.SESSION_EXPIRED, "다시 로그인해 주세요.", 401);
  }
  throw lastUncertain; // 시도 소진 — 마지막 불확실 실패 전파 (누락이면 SESSION_EXPIRED → terminal)
}

/** 동시 다발 401 의 중복 재발급 단일화 — **같은 세션의** 대기자만 결과를 공유하고,
    다른 세션의 요청은 자기 세션의 RT 로 별도 재발급을 시작한다.
    세션별 Map 이라 서로 다른 세션의 진행 작업이 공존해도 서로를 밀어내지 않는다 */
function reissueOnce(sessionId: string | null): Promise<void> {
  const existing = reissueInFlight.get(sessionId);
  if (existing) return existing;
  const promise = doReissue(sessionId).finally(() => {
    if (reissueInFlight.get(sessionId) === promise) reissueInFlight.delete(sessionId);
  });
  reissueInFlight.set(sessionId, promise);
  return promise;
}

export async function request<T>(
  method: Method,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const isPublic = PUBLIC_REQUESTS.has(`${method} ${path}`);
  // 단일 스냅샷 캡처 — 토큰과 세션 ID 가 서로 다른 시점의 조합일 수 없다
  const attempt = isPublic ? null : getAuthSnapshot();
  const attemptToken = attempt?.accessToken ?? null;
  const attemptSession = attempt?.sessionId ?? null;
  try {
    return await rawRequest<T>(method, path, opts, attemptToken);
  } catch (e) {
    // 재발급 트리거: 보호 요청의 401 만 — AT 유실·RT 생존의 부분 세션도 회복 대상.
    // 공개 요청(가입 A005 등)·Abort·비 401 은 그대로 전파.
    // FE 합성 중단(SESSION_REPLACED — bodyFactory 세션 가드 등)은 서버 401 이 아니므로 제외
    if (
      isPublic ||
      !isApiError(e) ||
      e.status !== 401 ||
      e.code === FE_ERROR_CODES.SESSION_REPLACED
    ) {
      throw e;
    }
    const policy = opts.onReauth ?? "redirect";
    // 인증 세션이 교체·제거됐다면(다른 계정 로그인·로그아웃) 이 요청은 이전 세션의
    // 것이므로 재시도하지 않는다 — 다른 계정의 자격증명으로 재실행되는 사고 차단.
    // REAUTH 도 발동하지 않는다(현재 세션은 유효할 수 있음 — 파괴 금지).
    if (getAuthSessionId() !== attemptSession) throw e;
    // 늦게 도착한 401 방어: 같은 세션에서 AT 만 이미 회전됐다면(선행 요청·다른 탭)
    // 재발급을 건너뛰고 새 토큰으로 재시도만 한다 — 불필요한 중복 회전 방지
    if (getAccessToken() === attemptToken) {
      try {
        await reissueOnce(attemptSession);
      } catch (re) {
        if (isTerminalReissueFailure(re)) await applyReauth(policy, attemptSession);
        throw re;
      }
    }
    // 재발급 대기 중 세션이 교체된 경우도 동일하게 중단 (이하 재시도는 동기 — 원자적)
    if (getAuthSessionId() !== attemptSession) throw e;
    try {
      // 정확히 1회 재시도 — bodyFactory 는 회전된 토큰을 반영해 재평가된다
      return await rawRequest<T>(method, path, opts, getAccessToken());
    } catch (e2) {
      // 2차 재발급 금지 — 재시도의 401 은 회복 불능
      if (isApiError(e2) && e2.status === 401) await applyReauth(policy, attemptSession);
      throw e2;
    }
  }
}
