/* ============================ 면접 종료 완료 (/live/ended) ============================ */
import { Navigate, useLocation } from "react-router";
import { Button } from "../components/ds";
import { Icon } from "../components/Icon";
import { useNav } from "../hooks/useNav";
import { ROUTES } from "../routes";

/** 종료 흐름(ROOM_DELETED 수렴)이 이동 state 로 남긴 표식 — 직행 여부 판별의 원천 */
interface EndedNavState {
  ended?: boolean;
}

export function InterviewEndedPage() {
  const nav = useNav();
  const location = useLocation();
  const ended = (location.state as EndedNavState | null)?.ended === true;

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
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.18)",
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
          color: "#f2f3f4",
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
          color: "rgba(255,255,255,.6)",
          textAlign: "center",
        }}
      >
        수고하셨어요! 답변 분석이 끝나면
        <br />
        리포트에서 결과를 확인할 수 있어요.
      </p>
      <div style={{ marginTop: 28 }}>
        <Button variant="solid" size="lg" onClick={() => nav("dash")}>
          대시보드로 이동
        </Button>
      </div>
    </div>
  );
}
