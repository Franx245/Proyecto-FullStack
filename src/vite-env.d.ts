/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_AUTH_PROVIDER?: string;
  readonly VITE_MP_PUBLIC_KEY?: string;
  readonly VITE_ENABLE_CART?: string;
  readonly VITE_ENABLE_ORDERS?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}