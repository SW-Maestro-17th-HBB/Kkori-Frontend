import { describe, expect, it } from "vitest";
import { layoutTrend, TREND_CHART, trendRange } from "./trendScale";

const { height, padTop, padBottom, minSpan } = TREND_CHART;

describe("trendRange — 데이터 기반 y 범위", () => {
  it("최소·최대에 여유를 두고, 0~100 을 넘지 않는다", () => {
    const { lo, hi } = trendRange([40, 96]);
    expect(lo).toBeLessThanOrEqual(40 - 5);
    expect(hi).toBeGreaterThanOrEqual(96 + 4); // 96 → 100 에서 클램프
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(100);
  });

  it("점수가 비슷하면 최소 폭을 확보해 미세한 차이가 급등락처럼 보이지 않게 한다", () => {
    const { lo, hi } = trendRange([82, 84, 83]);
    expect(hi - lo).toBeGreaterThanOrEqual(minSpan);
    expect(lo).toBeLessThan(82);
    expect(hi).toBeGreaterThan(84);
  });

  it.each([[[0, 0]], [[100, 100]], [[100]]])("극단값 %j 도 유효한 범위를 만든다", (scores) => {
    const { lo, hi } = trendRange(scores);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(100);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("layoutTrend — 점 좌표와 라벨", () => {
  it("점이 하나면 가운데(50%)에 두고 NaN 을 만들지 않는다", () => {
    const { points } = layoutTrend([83]);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBe(50);
    expect(Number.isFinite(points[0].y)).toBe(true);
  });

  it("x 는 0% 에서 100% 까지 균등하게 늘어난다", () => {
    const xs = layoutTrend([1, 2, 3, 4, 5]).points.map((p) => p.x);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(100);
    expect(xs).toEqual([0, 25, 50, 75, 100]);
  });

  it("어떤 점수든 y 가 여백 안에 놓이고, 점수가 높을수록 위(작은 y)에 온다", () => {
    const scores = [0, 40, 55, 72, 90, 96, 100];
    const ys = layoutTrend(scores).points.map((p) => p.y);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(padTop);
      expect(y).toBeLessThanOrEqual(height - padBottom);
    }
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
  });

  it("점이 8개 이하면 날짜 라벨을 모두 보여준다", () => {
    expect(layoutTrend([1, 2, 3, 4, 5]).showLabel.every(Boolean)).toBe(true);
  });

  it("점이 많으면 마지막부터 한 칸씩 건너뛰어 라벨을 보여준다 (마지막은 항상)", () => {
    const shown = layoutTrend(Array.from({ length: 12 }, (_, i) => 50 + i))
      .showLabel.map((v, i) => (v ? i : null))
      .filter((i) => i !== null);
    expect(shown).toEqual([1, 3, 5, 7, 9, 11]);
  });
});
