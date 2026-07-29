/** Segno DashAI: tessera con "dash" (trattino) + cursore da terminale.
 *  Inline così eredita i colori/definizioni della pagina. */
export default function BrandMark({ size = 26 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      <rect width="128" height="128" rx="30" fill="var(--color-bg)" />
      <rect x="26" y="57" width="54" height="14" rx="7" fill="var(--color-neutral-300)" />
      <rect x="88" y="47" width="14" height="34" rx="4" fill="var(--color-accent)" />
    </svg>
  )
}
