/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 주소. 비어 있으면 same-origin (로컬은 vite 프록시 사용) */
  readonly VITE_API_BASE_URL?: string;
  /** 카카오 인가용 앱 키 — 백엔드가 code 교환에 쓰는 키와 동일해야 함 */
  readonly VITE_KAKAO_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
