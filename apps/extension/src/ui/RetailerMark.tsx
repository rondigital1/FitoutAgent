import type { Retailer } from '@fitoutagent/shared';

const RAYS = [0, 60, 120, 180, 240, 300];

/** Simplified brand glyphs drawn locally — no retailer asset is fetched or bundled. */
function Glyph({ retailer }: { retailer: Retailer }) {
  const common = { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true } as const;
  if (retailer === 'Walmart') {
    return (
      <svg {...common}>
        <rect width="16" height="16" rx="3.5" fill="#0071dc" />
        <g fill="#ffc220">
          {RAYS.map(angle => (
            <rect key={angle} x="7.15" y="2.1" width="1.7" height="4.4" rx="0.85" transform={`rotate(${angle} 8 8)`} />
          ))}
        </g>
      </svg>
    );
  }
  if (retailer === 'BestBuy') {
    return (
      <svg {...common}>
        <rect width="16" height="16" rx="3.5" fill="#1d1d1b" />
        <path d="M2.4 5.4a1.8 1.8 0 0 1 1.8-1.8h5.5l3.7 4.4-3.7 4.4H4.2a1.8 1.8 0 0 1-1.8-1.8Z" fill="#ffe000" />
        <circle cx="5.1" cy="8" r="1" fill="#1d1d1b" />
      </svg>
    );
  }
  if (retailer === 'Shopify') {
    return (
      <svg {...common}>
        <rect width="16" height="16" rx="3.5" fill="#ffffff" stroke="#e2e6eb" />
        <path d="M3.5 5.9h9l-.8 7.1a1.3 1.3 0 0 1-1.3 1.2H5.6a1.3 1.3 0 0 1-1.3-1.2Z" fill="#5e8e3e" />
        <path d="M6.1 6V4.9a1.9 1.9 0 0 1 3.8 0V6" stroke="#5e8e3e" strokeWidth="1.25" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="#8b95a1" strokeWidth="1.3" strokeDasharray="2.6 2.2" />
    </svg>
  );
}

const LABELS: Record<Retailer, string> = {
  Walmart: 'Walmart',
  BestBuy: 'Best Buy',
  Shopify: 'Shopify',
  Mock: 'Simulated',
};

export function RetailerMark({ retailer, size = 'sm' }: { retailer: Retailer; size?: 'sm' | 'lg' }) {
  return (
    <span className={`wk-mark${size === 'lg' ? ' wk-mark--lg' : ''}`}>
      <Glyph retailer={retailer} />
      {LABELS[retailer]}
    </span>
  );
}

export const retailerLabel = (retailer: Retailer) => LABELS[retailer];
