/* 상대 시간 표시용 시계 — 외부 스토어로 두어 렌더 중 Date.now() 를 부르지 않는다.
   구독자가 있을 때만 주기적으로 갱신하고, 첫 구독 시점에 값을 새로 잡는다
   (구독은 effect 단계라 React 가 구독 직후 스냅샷 변화를 감지해 최신값으로 다시 그린다). */
import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let snapshot = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  snapshot = Date.now();
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    snapshot = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snapshot;

/** 현재 시각(ms) — 30초 단위로 갱신된다. 분 단위 상대 시간 표시에 충분하다 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
