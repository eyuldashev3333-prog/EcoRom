// Знак ECOROM (векторно, по logo.jpg): зелёная рама, чёрная открытая створка, две зелёные планки.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 328) / 196} viewBox="130 262 196 328" aria-hidden="true">
      <rect x="194" y="268" width="126" height="316" fill="#0a9b35" />
      <polygon points="229,293 320,335 320,520 229,558" fill="#fff" />
      <polygon points="135,333 229,293 229,558 135,520" fill="#141414" />
      <polygon points="265,355 320,370 320,408 265,403" fill="#0a9b35" />
      <polygon points="265,445 320,443 320,483 265,497" fill="#0a9b35" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wm-eco">ECO</span>
      <span className="wm-rom">ROM</span>
    </span>
  )
}
