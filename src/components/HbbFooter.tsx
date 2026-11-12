/* ---------- 랜딩 푸터 — 다크(--neutral-970) ----------
   링크는 실제로 존재하는 화면(예시 리포트 · 로그인)만 둔다. 준비되지 않은 페이지(요금·블로그·채용 등)는 적지 않는다.
   스타일은 global.css 의 .landing-footer* 클래스. */
import { Wordmark } from "./primitives";
import { useNav } from "../hooks/useNav";
import type { NavKey } from "../routes";

const LINKS: [string, NavKey][] = [
  ["예시 리포트", "sample"],
  ["로그인", "auth"],
];

export function HbbFooter() {
  const nav = useNav();
  return (
    <footer className="landing-footer">
      <div className="landing-wrap landing-footer__grid">
        <div className="landing-footer__brand">
          <Wordmark color="#fff" size={19} />
          <p className="landing-footer__desc">
            SW마에스트로 17기 팀 HBB가 만드는 개발자용 AI 음성 모의면접 서비스예요. 이력서를 분석해
            질문을 만들고, 음성 면접이 끝나면 답변별 피드백 리포트를 드려요.
          </p>
        </div>
        <nav aria-label="바로가기" className="landing-footer__links">
          <div className="landing-footer__h">둘러보기</div>
          {LINKS.map(([label, key]) => (
            <button key={key} className="linkbtn landing-footer__link" onClick={() => nav(key)}>
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="landing-wrap landing-footer__copy">© 2026 꼬리 잡힌 개발자 · 팀 HBB</div>
    </footer>
  );
}
