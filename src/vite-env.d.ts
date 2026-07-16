/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 주소. 비어 있으면 same-origin (로컬은 vite 프록시 사용) */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
