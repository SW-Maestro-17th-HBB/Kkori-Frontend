/* ============================================================
   공통 API 클라이언트 레이어
   백엔드 엔벨로프 계약(ApiResponse<T>) 기준으로 언래핑·에러 변환을 담당.
   - 성공: { success: true, data }  → data 반환
   - 실패: { success: false, error: { code, message, fieldErrors } } → ApiError throw
   - HTTP 상태코드는 바디에 없음 — 상태줄이 유일 원천, 구분은 비즈니스 code

   client.ts 의 fetcher 들이 이 request() 로 교체되며 화면 코드는 불변.
   ※ 토큰 부착·자동 재발급은 인증 스토리에서 이 파일에 추가 예정.
   ============================================================ */

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

interface RequestOptions {
  /** 객체는 JSON 직렬화, FormData 는 그대로 전송(Content-Type 은 브라우저가 지정) */
  body?: unknown;
  signal?: AbortSignal;
  /** HTTP 캐시 모드 — 캐시 재사용이 계약 위반인 조회(동의 카탈로그 등)는 "no-store" 지정 */
  cache?: RequestCache;
}

export async function request<T>(
  method: Method,
  path: string,
  { body, signal, cache }: RequestOptions = {},
): Promise<T> {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  // TODO(인증 스토리): access token 부착 + 401/A008 시 /auth/reissue 후 1회 재시도

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
      cache,
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
