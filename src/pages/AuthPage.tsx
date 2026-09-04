/* ============================ 로그인 (/login) ============================ */
import { useLocation } from "react-router";
import { Button } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, Wordmark } from "../components/primitives";
import { startKakaoLogin } from "../utils/kakaoLogin";

export function AuthPage() {
  const location = useLocation();
  // 가드(RequireAuth)가 전달한 원 목적지 — history state 는 임의 값일 수 있어 런타임 검증
  const state: unknown = location.state;
  const from =
    typeof state === "object" &&
    state !== null &&
    typeof (state as { from?: unknown }).from === "string"
      ? (state as { from: string }).from
      : null;
  /* 카카오 REST API 키 — 인가 요청 client_id 는 백엔드가 code 교환에 쓰는 키와 동일해야 함.
     모듈 상수가 아닌 렌더 시 평가 — 테스트의 vi.stubEnv 가 반영되게 한다 */
  const kakaoConfigured = Boolean(import.meta.env.VITE_KAKAO_CLIENT_ID);
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
          alignItems: "center",
          justifyContent: "center",
          padding: "72px 0",
        }}
      >
        <div
          style={{
            width: 380,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-16)",
            boxShadow: "var(--shadow-2)",
            padding: "44px 36px",
            textAlign: "center",
          }}
        >
          <Display size={26} tracking={-0.024} as="h2">
            시작하기
          </Display>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--fg-secondary)",
              marginTop: 10,
            }}
          >
            카카오 계정으로 3초 만에 시작해요.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            <Button
              variant="solid"
              size="lg"
              fullWidth
              leadingIcon={<Icon name="message-circle" size={18} />}
              onClick={() => startKakaoLogin(from)}
              disabled={!kakaoConfigured}
              style={kakaoConfigured ? { background: "#FEE500", color: "#191600" } : undefined}
            >
              카카오로 계속하기
            </Button>
            {!kakaoConfigured && (
              <p
                role="alert"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--red-700)",
                  margin: 0,
                }}
              >
                카카오 로그인 설정이 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.
              </p>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              marginTop: 28,
              paddingTop: 22,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {(
              [
                ["file-text", "이력서 분석"],
                ["mic", "음성 면접"],
                ["bar-chart-3", "점수 리포트"],
              ] as [string, string][]
            ).map(([ic, t]) => (
              <div
                key={t}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-brand-subtle)",
                    color: "var(--blue-800)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={ic} size={17} />
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--fg-tertiary)",
                  }}
                >
                  {t}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
