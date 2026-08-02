/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Active le mode WAMP/MySQL : « 1 » dans le build WAMP (`npm run build:wamp`). */
  readonly VITE_WAMP_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
