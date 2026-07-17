import { useCallback } from "react";
import { useNavigate } from "react-router";
import { consumePostLoginRedirect } from "../api/tokenStore";
import { ROUTES, type NavKey } from "../routes";

/* 프로토타입의 onNav(key) 시그니처를 실제 라우팅으로 대체.
   replace: 히스토리에 남기지 않을 이동(인증 콜백 등)에 사용 */
export function useNav() {
  const navigate = useNavigate();
  return useCallback(
    (key: NavKey, options?: { replace?: boolean }) => {
      navigate(ROUTES[key], options);
    },
    [navigate],
  );
}

/** 로그인 완료 지점(카카오 콜백·가입 성공) 전용 — 저장된 원 목적지(검증된 내부
    경로)를 1회 소비해 복귀하고, 없으면 대시보드로 간다. 항상 replace — 죽은 인증
    화면을 뒤로가기 기록에 남기지 않는다. 라우트 키 밖의 임의 경로 이동은 이 훅이
    유일한 통로 — 저장 경로 이동 정책(검증·폴백)이 화면마다 분산되지 않게 한다. */
export function usePostLoginRedirect() {
  const navigate = useNavigate();
  return useCallback(() => {
    navigate(consumePostLoginRedirect() ?? ROUTES.dash, { replace: true });
  }, [navigate]);
}
