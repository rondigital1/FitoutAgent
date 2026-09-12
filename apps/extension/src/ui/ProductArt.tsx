/** Deterministic line glyph for offers with no retailer image (the credential-free
 * mock catalog). Same offer id always draws the same figure. */
function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const INK = '#133a6f';
const DIM = '#c8cfd8';

function Figure({ variant }: { variant: number }) {
  const stroke = { stroke: INK, strokeWidth: 1.4, fill: 'none', vectorEffect: 'non-scaling-stroke' } as const;
  if (variant === 0) {
    return (
      <g {...stroke}>
        <rect x="18" y="26" width="44" height="28" rx="1.5" />
        <path d="M24 54v12M56 54v12M18 34h44" />
      </g>
    );
  }
  if (variant === 1) {
    return (
      <g {...stroke}>
        <circle cx="40" cy="34" r="13" />
        <path d="M40 47v14M28 61h24M33 34h14" />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <g {...stroke}>
        <rect x="22" y="20" width="36" height="14" rx="1.5" />
        <rect x="22" y="38" width="36" height="14" rx="1.5" />
        <rect x="22" y="56" width="36" height="10" rx="1.5" />
      </g>
    );
  }
  return (
    <g {...stroke}>
      <path d="M40 18 60 38H20Z" />
      <rect x="28" y="38" width="24" height="24" rx="1.5" />
      <path d="M40 46v8" />
    </g>
  );
}

export function ProductArt({ seed, label }: { seed: string; label: string }) {
  const h = hash(seed);
  const gridId = `wk-grid-${h % 997}`;
  return (
    <svg viewBox="0 0 80 80" role="img" aria-label={`${label} — no retailer photo available`}>
      <defs>
        <pattern id={gridId} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M8 0H0v8" fill="none" stroke={DIM} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="80" height="80" fill={`url(#${gridId})`} />
      <Figure variant={h % 4} />
    </svg>
  );
}
