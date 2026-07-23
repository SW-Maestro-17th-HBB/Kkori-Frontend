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
  /** 세션 식별자 — 합의 계약엔 있으나 현행 배포 스키마엔 없어 선택적 */
  id?: number;
}

export function saveInterviewSession(session: InterviewSessionRecord): boolean {
  try {
    const { url, token, room, authSessionId, id } = session;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url, token, room, authSessionId, ...(id !== undefined ? { id } : {}) }),
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
    const { url, token, room, authSessionId, id } = parsed as Record<string, unknown>;
    if (!isFilled(url) || !isFilled(token) || !isFilled(room) || !isFilled(authSessionId)) {
      return null;
    }
    return {
      url,
      token,
      room,
      authSessionId,
      ...(typeof id === "number" ? { id } : {}),
    };
  } catch {
    return null;
  }
}

export function clearInterviewSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 접근 불가 환경 — 지울 것도 없다
  }
}
