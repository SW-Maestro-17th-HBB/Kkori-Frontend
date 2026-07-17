/* ============================================================
   카카오 인가 시작 — AuthPage 에서 분리한 비컴포넌트 모듈.
   (컴포넌트 파일의 객체 export 는 react-refresh/only-export-components 위반이라
   테스트 seam 을 여기 둔다)
   ============================================================ */
import { createOauthState, setPostLoginRedirect } from "../api/tokenStore";
import { ROUTES } from "../routes";

/** 전체 페이지 이동 seam — jsdom 은 location.assign 미구현이라 테스트는 to 를 스파이 */
export const kakaoAuthorizeRedirect = {
  to: (url: string) => window.location.assign(url),
};

/** 카카오 인가 페이지로 이동. from 은 로그인 후 복귀할 원 목적지(가드가 전달한
    location.state) — 없으면 기존 저장값을 보존한다. 재인증 경유(request.ts)가
    저장한 목적지는 state 없이 /login 에 도착하므로 여기서 지우면 안 되고,
    묵은 값의 수명 상한은 TTL(tokenStore)이 담당한다. */
export function startKakaoLogin(from: string | null) {
  const clientId = import.meta.env.VITE_KAKAO_CLIENT_ID;
  if (!clientId) {
    console.warn("[auth] VITE_KAKAO_CLIENT_ID 가 설정되지 않았습니다 (.env.local 확인)");
    return;
  }
  if (from !== null) setPostLoginRedirect(from);
  const redirectUri = `${window.location.origin}${ROUTES.kakaoCallback}`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    // Login CSRF 방어 — 콜백에서 세션에 저장한 값과 대조
    state: createOauthState(),
  });
  kakaoAuthorizeRedirect.to(`https://kauth.kakao.com/oauth/authorize?${params}`);
}
