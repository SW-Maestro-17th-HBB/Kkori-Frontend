/* ============================ 카카오 콜백 (/auth/kakao/callback) ============================
   카카오 인가 후 돌아오는 얇은 화면 — code 를 백엔드로 교환하고 판정에 따라 라우팅한다.
   (명세: docs/requirements/user/auth.md §카카오 로그인)

   보안 처리 두 가지:
   - Login CSRF 방어: 인가 요청에 실었던 state 를 세션 저장값과 대조하고 즉시 폐기.
     불일치(공격자가 만든 콜백 URL 포함)면 교환 없이 실패 처리.
   - 1회용 code 를 URL·브라우저 기록에 남기지 않음: 첫 렌더에서 메모리로 캡처한 뒤
     주소를 즉시 정리하고, 모든 이동을 replace 로 처리. */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useKakaoLogin } from "../api/hooks";
import { isApiError } from "../api/request";
import { clearOauthState, peekOauthState, setSignupSession, setTokens } from "../api/tokenStore";
import { Button } from "../components/ds";
import { Display, Wordmark } from "../components/primitives";
import { ROUTES } from "../routes";

export function KakaoCallbackPage() {
  const navigate = useNavigate();
  const [params, setSearchParams] = useSearchParams();

  // URL 파라미터는 첫 렌더에서 한 번만 메모리로 캡처 (이후 URL 은 정리됨)
  const [initial] = useState(() => ({
    code: params.get("code"),
    state: params.get("state"),
    kakaoError: params.get("error"), // 사용자가 카카오 화면에서 취소한 경우 등
    storedState: peekOauthState(),
  }));

  const stateValid =
    initial.state !== null && initial.storedState !== null && initial.state === initial.storedState;
  const code = !initial.kakaoError && stateValid ? initial.code : null;
  const { data, isError, error } = useKakaoLogin(code);

  // state 폐기(1회용) + code·state 를 주소에서 즉시 제거
  const cleaned = useRef(false);
  useEffect(() => {
    clearOauthState();
    if (!cleaned.current) {
      cleaned.current = true;
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

  // 판정 결과에 따른 라우팅 (side effect — 렌더 중 navigate 금지)
  useEffect(() => {
    if (!data) return;
    if (data.accessToken && data.refreshToken) {
      // 기존 유저 — 즉시 로그인 완료
      setTokens(data.accessToken, data.refreshToken);
      navigate(ROUTES.dash, { replace: true });
    } else if (data.signupToken) {
      // 신규(isNewUser) 또는 복구(isRestored) — 동의 화면으로
      setSignupSession(data.signupToken, data.isRestored === true);
      navigate(ROUTES.consent, { replace: true });
    } else {
      // 계약 위반 — 토큰도 signupToken 도 없음
      navigate(ROUTES.auth, { replace: true });
    }
  }, [data, navigate]);

  const failed = isError || code === null;
  const message = initial.kakaoError
    ? "카카오 로그인이 취소되었어요."
    : code === null
      ? "잘못된 접근이에요. 다시 로그인해 주세요."
      : isError && isApiError(error)
        ? error.message
        : "로그인 처리 중 문제가 발생했어요. 다시 시도해 주세요.";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }}>
      <div
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <Wordmark />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "120px 24px",
          textAlign: "center",
          gap: 18,
        }}
      >
        {failed ? (
          <>
            <Display size={22} tracking={-0.02} as="h1">
              로그인에 실패했어요
            </Display>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--fg-secondary)",
                margin: 0,
              }}
            >
              {message}
            </p>
            <Button variant="solid" onClick={() => navigate(ROUTES.auth, { replace: true })}>
              다시 로그인하기
            </Button>
          </>
        ) : (
          <>
            <span
              className="status-spin"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "3px solid var(--blue-100)",
                borderTopColor: "var(--blue-800)",
                display: "inline-block",
              }}
            />
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--fg-secondary)",
                margin: 0,
              }}
            >
              카카오 로그인 처리 중이에요…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
