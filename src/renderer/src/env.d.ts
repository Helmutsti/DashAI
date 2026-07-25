/// <reference types="vite/client" />

import type { DashaiApi } from '../../preload'

declare global {
  interface Window {
    dashai: DashaiApi
  }
}

export {}
