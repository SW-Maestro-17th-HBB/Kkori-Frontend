/* ============================================================
   orval 생성 코드의 전송 계층 (orval.config.ts override.mutator)
   생성된 fetcher 가 이 함수로 요청을 위임한다 — 실제 전송은 공통 request() 가
   담당하므로 토큰 부착·자동 재발급·에러 변환(ApiError)이 그대로 적용된다.
   ============================================================ */
import { request } from "./request";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** orval 이 넘겨주는 요청 설정 (axios 호환 형태 — axios 의존성은 없음) */
export interface OrvalRequestConfig {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  signal?: AbortSignal;
  /** 생성 코드가 multipart 에 지정하는 Content-Type — 사용하지 않는다.
      FormData 는 브라우저가 boundary 포함 헤더를 직접 설정해야 하며, JSON 은 request() 가 지정한다. */
  headers?: Record<string, string>;
}

export const customInstance = async <T>(config: OrvalRequestConfig): Promise<T> => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.size > 0 ? `?${search.toString()}` : "";

  const data = await request<unknown>(
    config.method.toUpperCase() as Method,
    `${config.url}${query}`,
    {
      body: config.data,
      signal: config.signal,
    },
  );

  // request() 는 성공 엔벨로프를 언래핑해 data 만 반환한다(실패는 ApiError throw).
  // 생성 코드의 반환 타입은 엔벨로프(ApiResponse*)이므로 성공 형태로 복원해 돌려준다.
  return { success: true, data } as T;
};

export default customInstance;
