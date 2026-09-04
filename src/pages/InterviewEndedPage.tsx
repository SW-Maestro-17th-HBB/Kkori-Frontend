/* ============================ 면접 종료 완료 (/live/ended) ============================ */
import { Navigate, useLocation } from "react-router";
import { Button } from "../components/ds";
import { Icon } from "../components/Icon";
import { useNav } from "../hooks/useNav";
import { ROUTES } from "../routes";

/** 종료 흐름(ROOM_DELETED·연결 없는 종료·재입장 거부 수렴)이 이동 state 로 남긴 표식.
    ended 는 직행 여부 판별의 원천, reason 은 부제 분기용 —
    "reentry-denied" = 재입장이 "이미 종료된 세션"으로 거부된 수렴 (창 소진 포함.
    거부 코드가 사유를 구분해 주기 전까지는 중립 안내만 — BE 재연결 PRD 확정 대기) */
interface EndedNavState {
  ended?: boolean;
  reason?: string;
}

export function InterviewEndedPage() {
  const nav = useNav();
  const location = useLocation();
  const state = location.state as EndedNavState | null;
  const ended = state?.ended === true;
  const reentryDenied = state?.reason === "reentry-denied";

  // 종료 흐름을 거치지 않은 직행(URL 입력·새로고침)은 보여줄 종료 문맥이 없다 —
  // 대시보드로 돌려보낸다 (세션 레코드는 종료 시점에 이미 정리됨)
  if (!ended) return <Navigate to={ROUTES.dash} replace />;

  return (
    <div
      style={{
        background: "var(--neutral-970)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--bg-inverse-subtle)",
          border: "1px solid var(--border-inverse-strong)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--green-600)",
        }}
      >
        <Icon name="check" size={30} strokeWidth={2} />
      </div>
      <h1
        style={{
          margin: "22px 0 0",
          fontFamily: "var(--font-sans)",
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "var(--fg-inverse)",
        }}
      >
        면접이 끝났어요
      </h1>
      <p
        style={{
          margin: "10px 0 0",
          fontFamily: "var(--font-sans)",
          fontSize: 14.5,
          fontWeight: 500,
          lineHeight: 1.6,
          color: "var(--fg-inverse)",
          opacity: 0.7,
          textAlign: "center",
        }}
      >
        {reentryDenied ? (
          // 중립 안내 — 리포트 생성 여부(ABORTED 세션)가 BE 미확정이라 언급하지 않는다
          <>면접이 이미 종료되어 다시 입장할 수 없어요.</>
        ) : (
          <>
            수고하셨어요! 답변 분석이 끝나면
            <br />
            리포트에서 결과를 확인할 수 있어요.
          </>
        )}
      </p>
      <div style={{ marginTop: 28 }}>
        <Button variant="solid" size="lg" onClick={() => nav("dash")}>
          대시보드로 이동
        </Button>
      </div>
    </div>
  );
}
