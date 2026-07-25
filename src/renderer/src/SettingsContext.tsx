import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { translate, type Language } from './i18n'

export type ThemeChoice = 'dark' | 'light' | 'system'

export interface AppSettings {
  version: number
  language: Language
  theme: ThemeChoice
  /** Fattore di scala dell'interfaccia (1 = 100%). */
  uiScale: number
  /** Dimensione font dei terminali, in px. */
  terminalFontSize: number
}

export const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  language: 'it',
  theme: 'dark',
  uiScale: 1,
  terminalFontSize: 12.5
}

interface SettingsContextValue {
  settings: AppSettings
  /** Aggiorna una o piu impostazioni (merge) e le persiste. */
  update: (patch: Partial<AppSettings>) => void
  /** Traduce una chiave nella lingua corrente. */
  t: (key: string) => string
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  t: (key) => translate(DEFAULT_SETTINGS.language, key)
})

/** Risolve 'system' nel tema effettivo in base alle preferenze del SO. */
function resolveTheme(theme: ThemeChoice): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

/** Applica scala UI e tema al documento (variabili/attributi su :root). */
function applyToDocument(settings: AppSettings): void {
  const root = document.documentElement
  root.style.setProperty('--ui-scale', String(settings.uiScale))
  root.dataset.theme = resolveTheme(settings.theme)
}

function normalize(raw: unknown): AppSettings {
  const r = (raw ?? {}) as Partial<AppSettings>
  return {
    version: SETTINGS_VERSION,
    language: r.language === 'en' ? 'en' : 'it',
    theme: r.theme === 'light' || r.theme === 'system' ? r.theme : 'dark',
    uiScale: typeof r.uiScale === 'number' && r.uiScale > 0 ? r.uiScale : 1,
    terminalFontSize:
      typeof r.terminalFontSize === 'number' && r.terminalFontSize > 0 ? r.terminalFontSize : 12.5
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  // Evita di riscrivere il file col valore di default prima di aver caricato.
  const loaded = useRef(false)

  // Carica all'avvio.
  useEffect(() => {
    let alive = true
    void (async () => {
      const raw = await window.dashai.settings.load()
      if (!alive) return
      const next = normalize(raw)
      setSettings(next)
      applyToDocument(next)
      loaded.current = true
    })()
    return () => {
      alive = false
    }
  }, [])

  // Applica e persiste ad ogni cambio (dopo il primo load).
  useEffect(() => {
    applyToDocument(settings)
    if (loaded.current) void window.dashai.settings.save(settings)
  }, [settings])

  // Se il tema e 'system', reagisci ai cambi di preferenza del SO.
  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyToDocument(settings)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, t: (key) => translate(settings.language, key) }),
    [settings, update]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}
