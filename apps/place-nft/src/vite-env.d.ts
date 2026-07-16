/// <reference types="vite/client" />

declare const __FULL_RESOLUTION_IMAGE_URLS__: Readonly<Record<string, string>>

interface ImportMetaEnv {
  readonly VITE_CANDY_MACHINE_ID?: string;
  readonly VITE_SOL_DEV_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
