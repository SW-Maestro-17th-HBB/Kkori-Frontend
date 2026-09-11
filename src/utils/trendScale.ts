/* ============================================================
   점수 추이 차트 좌표 계산 (HBB1-335) — 순수 함수.
   ReportListPage 의 TrendChart 는 여기서 좌표만 받아 그린다.
   - y 범위는 데이터에서 계산한다. 고정 범위(55~90)는 그 밖의 점수를 차트 밖으로 밀어냈다.
   - 점이 하나면 가운데에 둔다 (n-1 로 나누면 0 으로 나누게 된다).
   - 날짜 라벨은 점이 많으면 마지막부터 한 칸씩 건너뛰어 겹치지 않게 한다.
   ============================================================ */

export const TREND_CHART = {
  /** 차트 영역 높이(px) */
  height: 96,
  /** 위 여백 — 점 위에 붙는 점수 숫자(≈14px)와 간격(12px)이 들어갈 자리 */
  padTop: 26,
  /** 아래 여백 — 가장 낮은 점이 바닥선에 붙지 않게 */
  padBottom: 8,
  /** y 범위 최소 폭(점) — 비슷한 점수의 미세한 차이가 급등락처럼 보이지 않게 */
  minSpan: 20,
  /** 범위 경계를 맞추는 단위(점) */
  step: 5,
  /** 날짜 라벨을 전부 보여줄 최대 점 수 — 넘으면 한 칸씩 건너뛴다 */
  maxLabels: 8,
} as const;

export interface TrendRange {
  lo: number;
  hi: number;
}

/** y 축 범위 — 최소·최대에 step 단위 여유를 두고 0~100 을 넘지 않게 한다 */
export function trendRange(scores: readonly number[]): TrendRange {
  const { minSpan, step } = TREND_CHART;
  let lo = Math.min(...scores);
  let hi = Math.max(...scores);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return {
    lo: Math.max(0, Math.floor(lo / step) * step - step),
    hi: Math.min(100, Math.ceil(hi / step) * step + step),
  };
}

export interface TrendLayout extends TrendRange {
  /** 각 점의 위치 — x 는 0~100(%), y 는 px (위가 0) */
  points: { x: number; y: number }[];
  /** 해당 인덱스의 날짜 라벨을 보여줄지 — 마지막 점은 항상 보여준다 */
  showLabel: boolean[];
}

export function layoutTrend(scores: readonly number[]): TrendLayout {
  const { height, padTop, padBottom, maxLabels } = TREND_CHART;
  const n = scores.length;
  const { lo, hi } = trendRange(scores);
  const inner = height - padTop - padBottom;
  const points = scores.map((s, i) => ({
    x: n === 1 ? 50 : (i / (n - 1)) * 100,
    y: height - padBottom - ((s - lo) / (hi - lo)) * inner,
  }));
  const showLabel = scores.map((_, i) => n <= maxLabels || (n - 1 - i) % 2 === 0);
  return { lo, hi, points, showLabel };
}
