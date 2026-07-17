/* ============================================================
   인증 판정 원천 — 가드(App.tsx)와 세션 관찰이 공유하는 단일 구독 지점.
   화면에서 저장소를 직접 읽지 않고 이 훅만 쓴다 — httpOnly 쿠키처럼 판정이
   비동기인 저장 전략으로 바뀌면 이 파일 내부만 교체한다("checking" 반환).
   ============================================================ */
import { useSyncExternalStore } from "react";
import { getAuthSessionId } from "../api/tokenStore";

/* storage 이벤트는 다른 탭의 쓰기에서만 발생한다. 같은 탭의 전이(로그인·로그아웃)는
   항상 명시적 네비게이션을 동반하므로 리렌더 시 getSnapshot 재평가로 반영된다. */
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/** 현재 인증 세션 ID 원시 구독 — 세션 제거·교체 감지(캐시 정리)가 ID 자체를 쓴다 */
export function useAuthSessionId(): string | null {
  return useSyncExternalStore(subscribe, getAuthSessionId);
}

export type AuthStatus = "authenticated" | "guest" | "checking";

/** 가드용 판정 — 현재 저장 전략(localStorage)은 동기라 "checking" 이 발생하지
    않지만, 비동기 판정 전환에 대비해 가드는 세 상태를 모두 처리한다. */
export function useAuthStatus(): AuthStatus {
  return useAuthSessionId() !== null ? "authenticated" : "guest";
}
