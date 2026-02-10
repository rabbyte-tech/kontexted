/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SERVER_URL?: string
  readonly VITE_AUTH_METHOD?: string
  readonly VITE_INVITE_CODE_AVAILABLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
