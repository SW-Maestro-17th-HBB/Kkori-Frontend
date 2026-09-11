/* 상대 시간 표시용 시계 — 외부 스토어로 두어 렌더 중 Date.now() 를 부르지 않는다.
   구독자가 있을 때만 주기적으로 갱신하고, 구독 전 첫 조회에서 현재 시각을 잡는다. */
import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let snapshot = 0;
// 구독자가 없는 동안 getSnapshot 이 현재 시각을 이미 캐시했는지 — 렌더 중 여러 번 불려도 같은 값을 돌려준다
let fresh = false;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  snapshot = Date.now();
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) timer = setInterval(tick, TICK_MS);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      if (timer !== null) clearInterval(timer);
      timer = null;
      fresh = false; // 다음 마운트의 첫 getSnapshot 이 현재 시각을 다시 잡게 한다
    }
  };
}

/** 구독 전 첫 호출에서 현재 시각을 한 번만 캐시한다 — 첫 paint 부터 최신값이고, 구독이 시작되면 tick 이 갱신을 이어받는다 */
function getSnapshot() {
  if (listeners.size === 0 && !fresh) {
    snapshot = Date.now();
    fresh = true;
  }
  return snapshot;
}

/** 현재 시각(ms) — 30초 단위로 갱신된다. 분 단위 상대 시간 표시에 충분하다 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
