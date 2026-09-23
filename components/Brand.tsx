/**
 * BoardCue mark ("Cue Columns"): three square, top-anchored board columns of different heights — a kanban
 * board and a voice waveform at once — plus the round cue dot, the card that just moved. See docs/brand/.
 */
export function BrandMark({ size = 28, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="8" y="10" width="12" height="30" fill="currentColor" />
      <rect x="26" y="10" width="12" height="44" fill="currentColor" />
      <rect x="44" y="10" width="12" height="18" fill="currentColor" />
      <circle cx="50" cy="41" r="6" fill={mono ? "currentColor" : "var(--logo-dot)"} />
    </svg>
  );
}

export function Brand({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="brand">
      <BrandMark size={size} />
      {wordmark && (
        <span className="brand-word" aria-hidden="true">
          board<b>cue</b>
        </span>
      )}
      <span className="sr-only">BoardCue</span>
    </span>
  );
}
