/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 주소. 비어 있으면 same-origin (로컬은 vite 프록시 사용) */
  readonly VITE_API_BASE_URL?: string;
  /** 카카오 REST API 키 (JavaScript 키 아님) — 백엔드가 code 교환에 쓰는 키와 동일해야 함 */
  readonly VITE_KAKAO_CLIENT_ID?: string;
  /** GA4 측정 ID (G-…). 비어 있으면 분석 코드가 전혀 동작하지 않음 — prod 빌드만 deploy.yml 이 주입 */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
