/* ============================================================
   면접 세션 핸드오프 — setup 에서 발급받은 접속 정보를 /live 로 전달.
   sessionStorage(탭 로컬)라 다른 탭과 공유되지 않고 새로고침엔 살아남는다.
   devicePreferences 패턴을 따르되 save 는 성공 여부를 반환한다 —
   토큰 없이는 /live 가 무의미하므로 저장 실패는 이동을 차단해야 한다.
   ============================================================ */

const STORAGE_KEY = "hbb.interview.session";

export interface InterviewSessionRecord {
  /** LiveKit 서버 URL */
  url: string;
  /** LiveKit 입장 토큰 */
  token: string;
  /** 발급된 룸 이름 (표시·디버깅용) */
  room: string;
  /** 발급 요청 시작 시점에 캡처한 인증 세션 ID — 계정 교체 감지용 */
  authSessionId: string;
  /** 세션 식별자 — 이후 세션 API 호출(종료·재입장·리포트 등)의 key */
  id: number;
  /** 마이크 의도 상태 — setup 핸드오프가 켜짐으로 시작하고(점검 필수 장비), 이후
      성공한 사용자 토글·복원 재발행 때만 갱신한다. 연결 해제로 SDK 발행이 꺼진 것은
      기록하지 않는다. 재입장·새로고침 복원의 원천.
      필드가 없는 구레코드는 꺼짐으로 취급한다 (예상 밖 자동 발행 방지) */
  micIntent?: boolean;
  /** 카메라 의도 상태 — setup 에서 카메라를 확보했으면 켜짐으로 시작하고, 이후
      성공한 사용자 토글 때만 갱신한다. 카메라는 룸에 publish 하지 않는 로컬
      self-view 전용이라 재입장·새로고침 복원도 접속과 무관하게 이 값을 따른다.
      필드가 없는 구레코드는 꺼짐으로 취급한다 (예상 밖 카메라 점등 방지) */
  camIntent?: boolean;
}

export function saveInterviewSession(session: InterviewSessionRecord): boolean {
  try {
    const { url, token, room, authSessionId, id } = session;
    const micIntent = session.micIntent === true;
    const camIntent = session.camIntent === true;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url, token, room, authSessionId, id, micIntent, camIntent }),
    );
    return true;
  } catch {
    return false; // 쿼터 초과 등 — 호출자가 이동을 차단한다
  }
}

const isFilled = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export function loadInterviewSession(): InterviewSessionRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { url, token, room, authSessionId, id, micIntent, camIntent } = parsed as Record<
      string,
      unknown
    >;
    if (!isFilled(url) || !isFilled(token) || !isFilled(room) || !isFilled(authSessionId)) {
      return null;
    }
    // id 없는 레코드는 구계약 저장분 — 무효 처리해 setup 재진입으로 유도한다
    if (typeof id !== "number") return null;
    return {
      url,
      token,
      room,
      authSessionId,
      id,
      micIntent: micIntent === true,
      camIntent: camIntent === true,
    };
  } catch {
    return null;
  }
}

/** 저장된 레코드의 micIntent 만 갱신 — 성공한 토글·복원 시점에 호출 (레코드 없으면 no-op) */
export function updateStoredMicIntent(micIntent: boolean) {
  const record = loadInterviewSession();
  if (record) saveInterviewSession({ ...record, micIntent });
}

/** 저장된 레코드의 camIntent 만 갱신 — 성공한 카메라 토글 시점에 호출 (레코드 없으면 no-op) */
export function updateStoredCamIntent(camIntent: boolean) {
  const record = loadInterviewSession();
  if (record) saveInterviewSession({ ...record, camIntent });
}

export function clearInterviewSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 접근 불가 환경 — 지울 것도 없다
  }
}
