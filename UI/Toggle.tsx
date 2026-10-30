/** Interruttore acceso/spento (impostazioni). */
export default function Toggle({
  on,
  onChange,
  label
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        flex: '0 0 auto',
        position: 'relative',
        width: 32,
        height: 18,
        padding: 0,
        border: 'none',
        borderRadius: 9,
        background: on ? 'var(--color-accent)' : 'var(--color-neutral-700)',
        cursor: 'pointer',
        transition: 'background 0.12s ease'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: on ? 'var(--color-bg)' : 'var(--color-neutral-300)',
          transition: 'left 0.12s ease'
        }}
      />
    </button>
  )
}
