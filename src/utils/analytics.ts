/* ============================================================
   GA4 분석 — 측정 ID(VITE_GA_MEASUREMENT_ID)가 있을 때만 활성.
   비어 있으면(로컬·CI·테스트) 어떤 함수도 아무 일을 하지 않는다 — prod 빌드만
   deploy.yml 이 GitHub Variables 에서 ID 를 주입한다.

   page_view 는 자동 전송(send_page_view)과 GA 콘솔의 "향상된 측정 > 브라우저
   기록 이벤트"를 모두 끄고 수동으로만 보낸다(App.tsx PageViewTracker). 자동 전송은
   첫 page_view 를 React 보다 먼저 전체 URL 로 쏘기 때문에 카카오 콜백의 code·state
   쿼리가 제3자로 나간다 — 수동 전송은 pathname 만 싣는다.
   (명세: docs/requirements/analytics/ga4.md)
   ============================================================ */

/** 빌드 시점 측정 ID — 비어 있으면 분석 비활성 */
export const GA_MEASUREMENT_ID: string = import.meta.env.VITE_GA_MEASUREMENT_ID ?? "";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const GTAG_SRC = "https://www.googletagmanager.com/gtag/js";

/** gtag 부트스트랩 — 공식 스니펫과 동일한 순서로 dataLayer 큐를 만들고 로더를 삽입한다.
    ID 가 없거나 이미 초기화됐으면(window.gtag 존재) no-op. 테스트는 ID 를 인자로 넘긴다. */
export function initAnalytics(measurementId: string = GA_MEASUREMENT_ID): void {
  if (measurementId === "" || window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  // gtag.js 는 큐 항목이 배열이 아닌 `arguments` 객체일 때만 명령으로 해석한다 — rest 파라미터로
  // 배열을 push 하면 조용히 무시되므로 공식 스니펫처럼 arguments 를 그대로 넣는다.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

/** page_view 1건 — pathname 만 싣고 쿼리스트링·해시는 절대 보내지 않는다.
    page_location 을 명시하지 않으면 gtag 가 document.location(쿼리 포함)으로 채운다. */
export function trackPageView(pathname: string): void {
  if (!window.gtag) return;
  window.gtag("event", "page_view", {
    page_location: window.location.origin + pathname,
  });
}
