/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHORT_MENU?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
