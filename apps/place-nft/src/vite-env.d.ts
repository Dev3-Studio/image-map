/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CANDY_MACHINE_ID?: string;
  readonly VITE_SOL_DEV_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
