/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CANDY_MACHINE_ID?: string;
  readonly VITE_SOL_DEV_ENDPOINT?: string;
  readonly VITE_COLLAGE_RELEASE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
