import { useCallback } from "react";
import { useNavigate } from "react-router";
import { ROUTES, type NavKey } from "../routes";

/* 프로토타입의 onNav(key) 시그니처를 실제 라우팅으로 대체 */
export function useNav() {
  const navigate = useNavigate();
  return useCallback(
    (key: NavKey) => {
      navigate(ROUTES[key]);
    },
    [navigate],
  );
}
