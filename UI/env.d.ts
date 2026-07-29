/// <reference types="vite/client" />

import type { DashaiApi } from './dashai-bridge'

declare global {
  interface Window {
    dashai: DashaiApi
  }
}

export {}
