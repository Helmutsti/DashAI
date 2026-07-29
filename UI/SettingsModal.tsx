import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { ArrowCounterClockwise, DownloadSimple, UploadSimple, X } from '@phosphor-icons/react'
import {
  useSettings,
  type AppSettings,
  type GridOrientation,
  type ThemeChoice
} from './SettingsContext'
import type { Language } from './i18n'
import { normalizeProjects, normalizePrompts, type Project, type Prompt } from './projects'
import { useOverlayDismiss } from './useOverlayDismiss'

export interface SettingsModalProps {
  onClose: () => void
  /** Progetti correnti, usati per l'esportazione. */
  projects: Project[]
  /** Elenco globale dei prompt, usato per l'esportazione. */
  prompts: Prompt[]
  /** Versione del file progetti. */
  projectsVersion: number
  /** Import (sostituisci tutto): rimpiazza progetti e prompt con quelli importati. */
  onReplaceData: (projects: Project[], prompts: Prompt[]) => void
  /** Riporta tracce e card a dimensioni uguali nell'orientamento corrente. */
  onResetLayout: () => void
}

export default function SettingsModal(props: SettingsModalProps): React.ReactElement {
  const { settings, update, t } = useSettings()
  const [msg, setMsg] = useState<string | null>(null)
  const overlayDismiss = useOverlayDismiss(props.onClose)

  // Versione dal manifest Tauri (tauri.conf.json), la stessa dell'installer.
  // Fuori dal webview Tauri (`npm run dev:renderer`) la chiamata fallisce: si resta vuoti.
  const [version, setVersion] = useState('')
  useEffect(() => {
    getVersion().then(setVersion, () => setVersion(''))
  }, [])

  // Esporta l'intero DB (db.json): progetti + prompt (elenco globale) + impostazioni.
  const doExport = async (): Promise<void> => {
    try {
      const ok = await window.dashai.projects.export({
        version: props.projectsVersion,
        projects: props.projects,
        prompts: props.prompts,
        settings
      })
      if (ok) setMsg(t('settings.export.ok'))
    } catch (err) {
      console.error('Esportazione fallita', err)
    }
  }

  // Importa db.json: ripristina progetti e impostazioni (per "riesumare" il lavoro).
  const doImport = async (): Promise<void> => {
    if (!window.confirm(t('settings.import.confirm'))) return
    try {
      const data = await window.dashai.projects.import()
      if (data === null) return // annullato: nessun messaggio
      const bundle = data as { projects?: unknown; prompts?: unknown; settings?: unknown }
      if (!Array.isArray(bundle.projects)) {
        setMsg(t('settings.import.invalid'))
        return
      }
      // Un file esportato in versione 1 non ha `prompts`: si riparte a vuoto,
      // i prompt annidati nei progetti non vengono recuperati.
      props.onReplaceData(normalizeProjects(bundle.projects), normalizePrompts(bundle.prompts))
      // Le impostazioni sono opzionali nel file; se presenti, ripristinale.
      if (bundle.settings && typeof bundle.settings === 'object') {
        update(bundle.settings as Partial<AppSettings>)
      }
      setMsg(t('settings.import.ok'))
    } catch (err) {
      console.error('Importazione fallita', err)
    }
  }

  return (
    <div {...overlayDismiss} style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        style={dialogStyle}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              flex: '1 1 auto',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: 16
            }}
          >
            {t('settings.title')}
          </div>
          <div
            className="menu-trigger"
            onClick={props.onClose}
            title={t('settings.close')}
            style={iconBtnStyle}
          >
            <X size={18} />
          </div>
        </div>

        {/* Corpo scrollabile */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
            overflowY: 'auto'
          }}
        >
          {/* Sezione: Aspetto */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>{t('settings.section.appearance')}</div>

            <div style={fieldStyle}>
              <span style={labelStyle}>{t('settings.language')}</span>
              <Segmented<Language>
                value={settings.language}
                options={[
                  { value: 'it', label: 'IT' },
                  { value: 'en', label: 'EN' }
                ]}
                onPick={(v) => update({ language: v })}
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>{t('settings.theme')}</span>
              <Segmented<ThemeChoice>
                value={settings.theme}
                options={[
                  { value: 'dark', label: t('settings.theme.dark') },
                  { value: 'light', label: t('settings.theme.light') },
                  { value: 'system', label: t('settings.theme.system') }
                ]}
                onPick={(v) => update({ theme: v })}
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>{t('settings.grid')}</span>
              <Segmented<GridOrientation>
                value={settings.gridOrientation}
                options={[
                  { value: 'rows', label: t('settings.grid.rows') },
                  { value: 'columns', label: t('settings.grid.columns') }
                ]}
                onPick={(v) => update({ gridOrientation: v })}
              />
              <span style={hintStyle}>{t('settings.grid.hint')}</span>
            </div>

            <div style={fieldStyle}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={props.onResetLayout}
                style={{ ...btnBase, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
              >
                <ArrowCounterClockwise
                  size={14}
                  style={{ marginRight: 6, verticalAlign: 'middle' }}
                />
                {t('settings.layout.reset')}
              </button>
              <span style={hintStyle}>{t('settings.layout.reset.hint')}</span>
            </div>

          </section>

          {/* Sezione: Progetti e dati */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>{t('settings.section.data')}</div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={doExport}
                style={{ ...btnBase, whiteSpace: 'nowrap' }}
              >
                <DownloadSimple size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('settings.export')}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={doImport}
                style={{ ...btnBase, whiteSpace: 'nowrap' }}
              >
                <UploadSimple size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('settings.import')}
              </button>
            </div>
            <span style={hintStyle}>{t('settings.data.hint')}</span>
            {msg && (
              <span style={{ ...hintStyle, color: 'var(--color-neutral-300)' }}>{msg}</span>
            )}
          </section>

          {/* Sezione: Scorciatoie — promemoria, non sono configurabili. */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>{t('settings.section.shortcuts')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {SHORTCUTS.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    minWidth: 0
                  }}
                >
                  <span style={{ ...hintStyle, flex: '1 1 auto', color: 'var(--color-neutral-300)' }}>
                    {t(s.label)}
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3
                    }}
                  >
                    {s.keys.map((k, i) => (
                      <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {i > 0 && <span style={{ ...hintStyle, fontSize: 10 }}>+</span>}
                        <kbd style={kbdStyle}>{k}</kbd>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <span style={hintStyle}>{t('settings.shortcuts.hint')}</span>
          </section>

          {version && (
            <div style={versionStyle}>
              {t('settings.version')} {version}
            </div>
          )}
        </div>

        {/* Azioni */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ flex: '1 1 auto' }} />
          <button
            type="button"
            className="btn btn--primary"
            onClick={props.onClose}
            style={{ ...btnBase, background: 'var(--color-accent)', color: 'var(--color-bg)' }}
          >
            {t('settings.done')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Selettore a segmenti (pillole) per scelte brevi e mutuamente esclusive. */
function Segmented<T extends string>({
  value,
  options,
  onPick
}: {
  value: T
  options: { value: T; label: string }[]
  onPick: (v: T) => void
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 3,
        border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius-md)',
        alignSelf: 'flex-start'
      }}
    >
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid transparent',
              background: active ? 'var(--color-accent)' : 'transparent',
              color: active ? 'var(--color-bg)' : 'var(--color-neutral-300)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Scorciatoie gestite in App.tsx, elencate qui come promemoria. */
const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: 'shortcut.next', keys: ['Ctrl', 'Tab'] },
  { label: 'shortcut.prev', keys: ['Ctrl', 'Shift', 'Tab'] },
  { label: 'shortcut.jump', keys: ['Alt', '1…9'] },
  { label: 'shortcut.move', keys: ['Ctrl', 'Alt', '←↑→↓'] },
  { label: 'shortcut.close', keys: ['Ctrl', 'Shift', 'W'] },
  { label: 'shortcut.sidebar', keys: ['Ctrl', 'B'] }
]

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-6)'
}
const dialogStyle: CSSProperties = {
  width: 'min(460px, 100%)',
  maxHeight: '86vh',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-lg)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)'
}
const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)'
}
const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)'
}
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }
const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--color-neutral-300)'
}
const hintStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: 'var(--color-neutral-500)'
}
/** Riga discreta in fondo al corpo del modale. */
const versionStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.02em',
  color: 'var(--color-neutral-500)',
  textAlign: 'center'
}
/** Tasto disegnato: monospazio, bordo tenue, come i "cap" di una tastiera. */
const kbdStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 10.5,
  lineHeight: 1.4,
  color: 'var(--color-neutral-300)',
  background: 'color-mix(in srgb, var(--color-text) 7%, transparent)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-sm)',
  padding: '1px 5px',
  whiteSpace: 'nowrap'
}
const btnBase: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--color-divider)',
  background: 'transparent',
  color: 'var(--color-text)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-5)',
  cursor: 'pointer'
}
const iconBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  cursor: 'pointer',
  borderRadius: 'var(--radius-sm)'
}
