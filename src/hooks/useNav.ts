import { useCallback } from "react";
import { useNavigate } from "react-router";
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
