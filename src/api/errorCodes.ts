/* ============================================================
   백엔드 에러 코드 (2026-07-16 스냅샷)
   ============================================================ */
export const ERROR_CODES = {
  // ---------- 공통 (C) ----------
  /** 500 — 서버 내부 오류가 발생했습니다. */
  INTERNAL_SERVER_ERROR: "C001",
  /** 400 — 입력값이 올바르지 않습니다. */
  INVALID_INPUT_VALUE: "C002",
  /** 405 — 지원하지 않는 HTTP 메서드입니다. */
  METHOD_NOT_ALLOWED: "C003",
  /** 404 — 요청한 리소스를 찾을 수 없습니다. */
  RESOURCE_NOT_FOUND: "C004",
  /** 401 — 인증이 필요합니다. */
  UNAUTHORIZED: "C005",
  /** 403 — 접근 권한이 없습니다. */
  FORBIDDEN: "C006",

  // ---------- 이력서 (R) —----------
  /** 400 — 업로드할 파일이 필요합니다. */
  FILE_REQUIRED: "R001",
  /** 400 — PDF 파일만 업로드할 수 있습니다. */
  INVALID_FILE_TYPE: "R002",
  /** 413 — 파일 크기는 10MB를 초과할 수 없습니다. */
  FILE_TOO_LARGE: "R003",
  /** 400 — 손상되었거나 읽을 수 없는 PDF 파일입니다. */
  INVALID_PDF: "R004",
  /** 400 — PDF는 최대 10페이지까지 업로드할 수 있습니다. */
  PAGE_LIMIT_EXCEEDED: "R005",
  /** 500 — 파일 저장에 실패했습니다. */
  FILE_UPLOAD_FAILED: "R006",
  /** 500 — 이력서 분석 요청에 실패했습니다. */
  RESUME_ANALYSIS_REQUEST_FAILED: "R007",

  // ---------- 인증 (A) ----------
  /** 400 — 카카오 인가 코드가 누락되었거나 형식이 올바르지 않습니다. */
  INVALID_CODE: "A001",
  /** 401 — 카카오 인증에 실패했습니다. 다시 로그인해 주세요. */
  KAKAO_AUTH_FAILED: "A002",
  /** 500 — 카카오 서버와의 통신에 실패했습니다. */
  KAKAO_SERVER_ERROR: "A003",
  /** 400 — 필수 동의 항목에 모두 동의해야 가입할 수 있습니다. */
  MISSING_REQUIRED_CONSENT: "A004",
  /** 401 — 가입 토큰이 유효하지 않습니다. 다시 로그인해 주세요. */
  INVALID_SIGNUP_TOKEN: "A005",
  /** 409 — 이미 가입된 계정입니다. */
  ALREADY_REGISTERED: "A006",
  /** 401 — 유효하지 않은 토큰입니다. 다시 로그인해 주세요. */
  RT_NOT_FOUND: "A007",
  /** 401 — 토큰이 만료되었습니다. 다시 로그인해 주세요. */
  RT_EXPIRED: "A008",
  /** 401 — 다른 기기에서 토큰 재사용이 감지되었습니다. 다시 로그인해 주세요. */
  RT_REUSE_DETECTED: "A009",

  // ---------- 사용자 (U) ----------
  /** 400 — 이름은 앞뒤 공백을 제외하고 1~100자여야 합니다. */
  INVALID_NAME: "U001",
  /** 409 — 탈퇴 처리 중인 계정입니다. 잠시 후 다시 시도해 주세요. */
  PURGE_IN_PROGRESS: "U002",
} as const;

export type ErrorCodeName = keyof typeof ERROR_CODES;
export type ErrorCode = (typeof ERROR_CODES)[ErrorCodeName];

export const REAUTH_REQUIRED_CODES: readonly ErrorCode[] = [
  ERROR_CODES.UNAUTHORIZED,
  ERROR_CODES.INVALID_SIGNUP_TOKEN,
  ERROR_CODES.RT_NOT_FOUND,
  ERROR_CODES.RT_EXPIRED,
  ERROR_CODES.RT_REUSE_DETECTED,
] as const;
