/* ============================================================
   면접 재입장 오케스트레이션 — 자동 시도 스케줄·단일 진행·늦은 응답 폐기를
   캡슐화한다. 화면은 트리거·중단 조건을 파생값으로 내려주고 상태만 소비한다.
   상태 전이는 전부 타이머·프라미스·Room 이벤트 콜백에서 일어난다
   (effect 본문은 구독 설치·예약만 — set-state-in-effect 규칙 대응).
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import type { ReenterSessionResponse } from "../api/client";
import { useReenterInterviewSession } from "../api/hooks";
import { REENTRY_ATTEMPT_DELAYS_MS, REENTRY_SESSION_ENDED_CODE } from "../api/reentryContract";
import { isApiError } from "../api/request";

interface ReentryOptions {
  room: Room;
  /** 재입장 대상 세션 id — 게이트 실패 등으로 없으면 null (전체 비활성) */
  sessionId: number | null;
  /** 재입장 트리거 — PRD 조건식: Disconnected ∧ (접속 실패 ∨ 비 ROOM_DELETED 해제) */
  triggered: boolean;
  /** 종료 요청 발신~결과 도착: 일시 중단 (재개 시 남은 시도를 이어간다) */
  suspended: boolean;
  /** 종료 확정(202·S008)·ROOM_DELETED: 영구 중단 */
  halted: boolean;
  /** 발급 성공 — 화면이 인증 재대조 후 활성 세션을 교체해 재접속을 일으킨다 */
  onIssued: (issued: ReenterSessionResponse) => void;
  /** "이미 종료" 거부 — 화면이 저장값 정리 후 종료 화면으로 수렴한다 */
  onDenied: () => void;
}

export interface ReentryState {
  /** 이번 끊김 국면에서 소모한 시도 수 — 재접속 성공 시 0 으로 복귀.
      0 초과 + Connecting 이면 재입장발 접속 중 (오버레이 유지 판정용) */
  attemptsUsed: number;
  /** 토큰 발급 요청 진행 중 — 수동 버튼 비활성의 근거 */
  requesting: boolean;
  /** 자동 시도 소진 — 이후는 수동 전용 */
  exhausted: boolean;
  /** 수동 "다시 연결" — 남은 자동 일정을 취소하고 즉시 1회 시도 */
  retry: () => void;
}

export function useReentry({
  room,
  sessionId,
  triggered,
  suspended,
  halted,
  onIssued,
  onDenied,
}: ReentryOptions): ReentryState {
  const reenter = useReenterInterviewSession();
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [requesting, setRequesting] = useState(false);

  // 시도가 유효한 국면인지 — 발급 응답 도착 시점에 참조한다 (늦은 응답 폐기의 기준).
  // 일시 중단·영구 중단·이미 재접속(triggered 해제) 전부 이 값 하나로 걸러진다.
  const armed = triggered && !suspended && !halted && sessionId !== null;
  const armedRef = useRef(false);
  // 단일 진행 — 발급 요청이 날아가 있는 동안 새 시도를 막는 동기 가드
  const busyRef = useRef(false);
  const onIssuedRef = useRef(onIssued);
  const onDeniedRef = useRef(onDenied);
  useEffect(() => {
    armedRef.current = armed;
    onIssuedRef.current = onIssued;
    onDeniedRef.current = onDenied;
  });

  const mutateReenter = reenter.mutateAsync;
  const runAttempt = useCallback(() => {
    if (busyRef.current || sessionId === null) return;
    busyRef.current = true;
    setRequesting(true);
    mutateReenter(sessionId)
      .then(
        (issued) => {
          if (armedRef.current) onIssuedRef.current(issued);
        },
        (err: unknown) => {
          if (!armedRef.current) return; // 중단된 국면의 늦은 실패 — 폐기
          if (isApiError(err) && err.code === REENTRY_SESSION_ENDED_CODE) onDeniedRef.current();
          // 그 외 실패(네트워크 등)는 시도 1회 소모 — 다음 예약은 스케줄 effect 가 잡는다
        },
      )
      .finally(() => {
        busyRef.current = false;
        setRequesting(false);
      });
  }, [mutateReenter, sessionId]);

  // 자동 시도 스케줄 — 예약만 하고, 소모·실행은 타이머 콜백에서 일어난다.
  // 성공(세션 교체 → Connecting)·중단은 armed 가 꺼져 예약이 cleanup 으로 취소된다.
  useEffect(() => {
    if (!armed || requesting || attemptsUsed >= REENTRY_ATTEMPT_DELAYS_MS.length) return;
    const timer = setTimeout(() => {
      if (!armedRef.current) return; // 예약 후 국면이 끝났다(재접속·중단) — 시도를 소모하지 않는다
      setAttemptsUsed((used) => used + 1);
      runAttempt();
    }, REENTRY_ATTEMPT_DELAYS_MS[attemptsUsed]);
    return () => clearTimeout(timer);
  }, [armed, requesting, attemptsUsed, runAttempt]);

  // 재접속 성공 — 다음 끊김은 새 국면으로 자동 시도 전량을 되찾는다
  useEffect(() => {
    const handleStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) setAttemptsUsed(0);
    };
    room.on(RoomEvent.ConnectionStateChanged, handleStateChanged);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleStateChanged);
    };
  }, [room]);

  const retry = useCallback(() => {
    if (!armedRef.current || busyRef.current) return;
    // 남은 자동 일정 취소(소진 상태로 전환 — 스케줄 effect 가 예약을 걷어간다) + 즉시 1회
    setAttemptsUsed(REENTRY_ATTEMPT_DELAYS_MS.length);
    runAttempt();
  }, [runAttempt]);

  return {
    attemptsUsed,
    requesting,
    exhausted: attemptsUsed >= REENTRY_ATTEMPT_DELAYS_MS.length,
    retry,
  };
}
