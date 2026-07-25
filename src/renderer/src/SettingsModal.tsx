import { useState } from 'react'
import type { CSSProperties } from 'react'
import { DownloadSimple, UploadSimple, X } from '@phosphor-icons/react'
import { useSettings, type AppSettings, type ThemeChoice } from './SettingsContext'
import type { Language } from './i18n'
import { normalizeProjects, type Project } from './projects'

export interface SettingsModalProps {
  onClose: () => void
  /** Progetti correnti, usati per l'esportazione. */
  projects: Project[]
  /** Versione del file progetti. */
  projectsVersion: number
  /** Import (sostituisci tutto): rimpiazza i progetti con quelli importati. */
  onReplaceProjects: (projects: Project[]) => void
}

export default function SettingsModal(props: SettingsModalProps): React.ReactElement {
  const { settings, update, t } = useSettings()
  const [msg, setMsg] = useState<string | null>(null)

  // Esporta l'intero DB (db.json): progetti + prompt (dentro i progetti) + impostazioni.
  const doExport = async (): Promise<void> => {
    const ok = await window.dashai.projects.export({
      version: props.projectsVersion,
      projects: props.projects,
      settings
    })
    if (ok) setMsg(t('settings.export.ok'))
  }

  // Importa db.json: ripristina progetti e impostazioni (per "riesumare" il lavoro).
  const doImport = async (): Promise<void> => {
    if (!window.confirm(t('settings.import.confirm'))) return
    const data = await window.dashai.projects.import()
    if (data === null) return // annullato: nessun messaggio
    const bundle = data as { projects?: unknown; settings?: unknown }
    if (!Array.isArray(bundle.projects)) {
      setMsg(t('settings.import.invalid'))
      return
    }
    props.onReplaceProjects(normalizeProjects(bundle.projects))
    // Le impostazioni sono opzionali nel file; se presenti, ripristinale.
    if (bundle.settings && typeof bundle.settings === 'object') {
      update(bundle.settings as Partial<AppSettings>)
    }
    setMsg(t('settings.import.ok'))
  }

  return (
    <div onClick={props.onClose} style={overlayStyle}>
      <div
        onClick={(e) => e.stopPropagation()}
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
              <span style={labelStyle}>
                {t('settings.uiScale')} — {Math.round(settings.uiScale * 100)}%
              </span>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={settings.uiScale}
                onChange={(e) => update({ uiScale: Number(e.target.value) })}
                style={rangeStyle}
              />
            </div>
          </section>

          {/* Sezione: Terminale */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>{t('settings.section.terminal')}</div>
            <div style={fieldStyle}>
              <span style={labelStyle}>
                {t('settings.terminalFontSize')} — {settings.terminalFontSize}px
              </span>
              <input
                type="range"
                min={10}
                max={22}
                step={0.5}
                value={settings.terminalFontSize}
                onChange={(e) => update({ terminalFontSize: Number(e.target.value) })}
                style={rangeStyle}
              />
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
  gap: 'var(--space-5)',
  zoom: 'var(--ui-scale)' as CSSProperties['zoom']
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
const rangeStyle: CSSProperties = { width: '100%', accentColor: 'var(--color-accent)', cursor: 'pointer' }
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
