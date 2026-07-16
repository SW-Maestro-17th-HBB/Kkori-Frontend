/* ============================ 카카오 콜백 (/auth/kakao/callback) ============================
   카카오 인가 후 돌아오는 얇은 화면 — code 를 백엔드로 교환하고 판정에 따라 라우팅한다.
   (명세: docs/requirements/user/auth.md §카카오 로그인) */
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useKakaoLogin } from "../api/hooks";
import { isApiError } from "../api/request";
import { setSignupSession, setTokens } from "../api/tokenStore";
import { Button } from "../components/ds";
import { Display, Wordmark } from "../components/primitives";
import { useNav } from "../hooks/useNav";
import { ROUTES } from "../routes";

export function KakaoCallbackPage() {
  const nav = useNav();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kakaoError = params.get("error"); // 사용자가 카카오 화면에서 취소한 경우 등
  const code = kakaoError ? null : params.get("code");
  const { data, isError, error } = useKakaoLogin(code);

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
  const message = kakaoError
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
            <Button variant="solid" onClick={() => nav("auth")}>
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
