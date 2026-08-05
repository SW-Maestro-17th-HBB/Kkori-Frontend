/* 비로그인 공개 화면(랜딩·예시 리포트) 공용 상단 헤더.
   로그인 전용 TopNav와 달리 프로필·알림에 의존하지 않는다. 로고를 누르면 랜딩으로 나간다. */
import { Button } from "./ds";
import { Wordmark } from "./primitives";
import { useNav } from "../hooks/useNav";

export function PublicHeader() {
  const nav = useNav();
  return (
    <header
      style={{
        height: 60,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          height: "100%",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <button className="linkbtn" onClick={() => nav("landing")} aria-label="홈으로">
          <Wordmark />
        </button>
        <div style={{ flex: 1 }} />
        <Button variant="solid" onClick={() => nav("auth")}>
          로그인
        </Button>
      </div>
    </header>
  );
}
