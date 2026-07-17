/* ============================================================
   토큰 저장소
   - AT/RT: 로그인 세션 — localStorage 확정(HBB1-251). 백엔드 계약이 RT 를
     응답 body 로만 주고받게 강제(쿠키 금지, reissue 는 body 전송)해 JS-readable
     저장이 불가피하고, RTR(회전) 하에서는 탭 간 저장소 공유가 정합성 요건
     (탭별 격리 시 구 RT 재사용 → 재사용 감지로 전 기기 로그아웃).
     httpOnly 쿠키/BFF 전환은 백엔드 협의 후속 — 전환 시 이 모듈과 request.ts 만 교체.
   - signupToken: 가입/복구 진행 중에만 쓰는 임시 값(10분 유효) — 탭 단위
     생명주기면 충분하므로 sessionStorage 에 보관하고 가입 완료 시 제거.
   ============================================================ */

const AUTH_KEY = "kkori.auth";
const SIGNUP_KEY = "kkori.signupToken";
const RESTORE_KEY = "kkori.isRestored";

/** 인증 세션 스냅샷 — AT/RT/세션 ID 를 **하나의 JSON 레코드**로 저장한다.
    키를 분산하면 다른 탭이 쓰기 도중의 찢어진 조합(AT-B + RT-A 등)을 읽을 수 있다.
    세션 ID 는 "누구의 세션인가"의 안정 식별자: 재발급(rotateTokens)으로 토큰이
    회전해도 유지되고, 다른 계정 로그인·로그아웃 시에만 바뀌거나 사라진다 —
    지연된 401 처리에서 "같은 세션의 회전"(재시도 가능)과 "세션 교체"(재시도 금지)를
    구분하는 근거. localStorage 라 멀티탭 공유. */
export interface AuthSnapshot {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/** 불완전·변조 레코드는 세션 없음으로 취급 — 부분 상태가 존재할 수 없게 한다 */
export function getAuthSnapshot(): AuthSnapshot | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const r: unknown = JSON.parse(raw);
    if (
      typeof r === "object" &&
      r !== null &&
      typeof (r as AuthSnapshot).accessToken === "string" &&
      typeof (r as AuthSnapshot).refreshToken === "string" &&
      typeof (r as AuthSnapshot).sessionId === "string"
    ) {
      return r as AuthSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

/* 탭 간 변이 직렬화 — "검사 후 쓰기"(회전)와 다른 탭의 로그인·로그아웃 쓰기가
   교차하지 않도록 Web Locks 로 잠근다. 미지원 환경(jsdom 등)은 단일 프로세스라
   즉시 실행 폴백으로 충분하다. 쓰기 자체는 단일 키라 개별적으로 원자적. */
const LOCK_NAME = "kkori.auth";

function withAuthLock<T>(fn: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, () => fn());
  }
  return Promise.resolve(fn());
}

/** 로그인·가입 성공 — 토큰 쌍 저장 + **새 인증 세션 ID 발급** */
export function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  return withAuthLock(() => {
    const record: AuthSnapshot = { accessToken, refreshToken, sessionId: crypto.randomUUID() };
    localStorage.setItem(AUTH_KEY, JSON.stringify(record));
  });
}

/** 재발급 회전 (request.ts 전용) — **잠금 안에서 세션 ID 를 재확인**한 뒤 저장한다.
    대기 중 세션이 교체·제거됐으면(다른 계정 로그인/로그아웃) 저장하지 않고 false —
    A 세션의 회전 쌍이 B 세션의 저장소를 덮어쓰는 사고를 탭 간에도 차단. */
export function rotateTokens(
  accessToken: string,
  refreshToken: string,
  expectedSessionId: string,
): Promise<boolean> {
  return withAuthLock(() => {
    const current = getAuthSnapshot();
    if (!current || current.sessionId !== expectedSessionId) return false;
    const record: AuthSnapshot = { accessToken, refreshToken, sessionId: current.sessionId };
    localStorage.setItem(AUTH_KEY, JSON.stringify(record));
    return true;
  });
}

export function getAccessToken(): string | null {
  return getAuthSnapshot()?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return getAuthSnapshot()?.refreshToken ?? null;
}

export function getAuthSessionId(): string | null {
  return getAuthSnapshot()?.sessionId ?? null;
}

/** 세션 삭제 — expectedSessionId 를 주면 **잠금 안에서 현재 세션과 대조해 일치할 때만**
    삭제한다(불일치 = 그 사이 다른 계정이 로그인 → 남의 세션 파괴 금지, false 반환).
    인자 생략 시 무조건 삭제(테스트·강제 정리용). */
export function clearTokens(expectedSessionId?: string | null): Promise<boolean> {
  return withAuthLock(() => {
    if (expectedSessionId !== undefined) {
      const current = getAuthSnapshot()?.sessionId ?? null;
      if (current !== expectedSessionId) return false;
    }
    localStorage.removeItem(AUTH_KEY);
    return true;
  });
}

export function isLoggedIn(): boolean {
  return getAuthSnapshot() !== null;
}

/* ---------- OAuth state (Login CSRF 방어) ----------
   인가 요청에 포함한 난수를 콜백에서 대조해, 공격자가 만든 콜백 URL 로
   피해자를 로그인시키는 공격을 차단한다. 1회용 — 콜백에서 검증 후 즉시 폐기. */

const OAUTH_STATE_KEY = "kkori.oauthState";

export function createOauthState(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  return state;
}

export function peekOauthState(): string | null {
  return sessionStorage.getItem(OAUTH_STATE_KEY);
}

export function clearOauthState() {
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

/* ---------- 가입/복구 진행 상태 (임시) ----------
   만료(10분)는 클라이언트에서 검사하지 않는다 — 서버가 서명·만료를 검증해
   만료 시 A005(INVALID_SIGNUP_TOKEN)를 반환하고, 화면은 재로그인 유도로 처리한다. */

export function setSignupSession(signupToken: string, isRestored: boolean) {
  sessionStorage.setItem(SIGNUP_KEY, signupToken);
  sessionStorage.setItem(RESTORE_KEY, String(isRestored));
}

export function getSignupSession(): { signupToken: string; isRestored: boolean } | null {
  const signupToken = sessionStorage.getItem(SIGNUP_KEY);
  if (!signupToken) return null;
  return { signupToken, isRestored: sessionStorage.getItem(RESTORE_KEY) === "true" };
}

export function clearSignupSession() {
  sessionStorage.removeItem(SIGNUP_KEY);
  sessionStorage.removeItem(RESTORE_KEY);
}
