/* ============================================================
   토큰 저장소
   - AT/RT: 로그인 세션. 저장 위치 전략은 HBB1-251에서 확정 예정이며
     현재는 localStorage 기반 최소 구현 (교체가 쉽도록 이 모듈로 격리).
   - signupToken: 가입/복구 진행 중에만 쓰는 임시 값(10분 유효) — 탭 단위
     생명주기면 충분하므로 sessionStorage 에 보관하고 가입 완료 시 제거.
   ============================================================ */

const AT_KEY = "kkori.accessToken";
const RT_KEY = "kkori.refreshToken";
const SIGNUP_KEY = "kkori.signupToken";
const RESTORE_KEY = "kkori.isRestored";

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(AT_KEY, accessToken);
  localStorage.setItem(RT_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(AT_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(RT_KEY);
}

export function clearTokens() {
  localStorage.removeItem(AT_KEY);
  localStorage.removeItem(RT_KEY);
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null;
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
