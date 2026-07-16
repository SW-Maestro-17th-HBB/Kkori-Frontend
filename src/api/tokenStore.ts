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

/* ---------- 가입/복구 진행 상태 (임시) ---------- */

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
