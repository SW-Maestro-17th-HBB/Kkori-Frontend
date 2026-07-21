/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 주소. 비어 있으면 same-origin (로컬은 vite 프록시 사용) */
  readonly VITE_API_BASE_URL?: string;
  /** 카카오 REST API 키 (JavaScript 키 아님) — 백엔드가 code 교환에 쓰는 키와 동일해야 함 */
  readonly VITE_KAKAO_CLIENT_ID?: string;
  /** LiveKit 서버 WebSocket 주소 (예: wss://<project>.livekit.cloud) */
  readonly VITE_LIVEKIT_URL?: string;
  /** LiveKit 접속 토큰 — 백엔드 발급 API 전까지의 임시 개발용 (미설정 시 룸 접속 비활성) */
  readonly VITE_LIVEKIT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
