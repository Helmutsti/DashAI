/// <reference types="vite/client" />

import type { DashiaiApi } from '../../preload'

declare global {
  interface Window {
    dashiai: DashiaiApi
  }
}

export {}
