import type { ReactNode } from 'react';

const icons: [RegExp, ReactNode][] = [
  [/mug|cup|glass/i, <><path d="M4 5h12v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3ZM16 7h2a3 3 0 0 1 0 6h-2"/></>],
  [/kettle/i, <><path d="M7 8h9l3 11H5ZM9 5h5M8 8V5a4 4 0 0 1 8 0v3M6 12l-4-2 3 7"/></>],
  [/mattress|bed|pillow/i, <><path d="M3 18V7m18 11V10M3 14h18v4M3 10h18v4M6 10V7h5v3m2 0V7h5v3" /></>],
  [/sofa|couch|seating|living/i, <><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M5 15h14M5 19v-2m14 2v-2"/><path d="M5 11a2 2 0 0 0-4 0v6h22v-6a2 2 0 0 0-4 0v4H5Z"/></>],
  [/chair|stool/i, <><path d="M7 13V4h10v9M5 13h14v4H5Zm2 4-1 4m11-4 1 4M7 8h10"/></>],
  [/table|desk|dining/i, <><path d="M3 9h18v4H3Zm3 4v8m12-8v8M8 6h8"/></>],
  [/light|lamp/i, <><path d="m8 3-4 10h16L16 3ZM12 13v7m-5 1h10"/></>],
  [/curtain|window|covering/i, <><path d="M3 4h18M5 4v16l5-3V4m4 0v13l5 3V4M10 12h4"/></>],
  [/storage|dresser|cabinet|shelf|bookcase/i, <><rect x="4" y="3" width="16" height="17" rx="1"/><path d="M4 9h16M4 15h16M10 6h4m-4 6h4m-4 6h4M6 20v2m12-2v2"/></>],
  [/towel|linen|blanket|bedding/i, <><path d="M4 5h16v14H4ZM8 5v14M11 15h6m-6 2h6"/></>],
  [/rug|mat|carpet/i, <><path d="M5 5h14v14H5Zm3 3h8v8H8M5 2v3m5-3v3m4-3v3m5-3v3M5 19v3m5-3v3m4-3v3m5-3v3"/></>],
  [/kitchen|cook|pan|pot/i, <><path d="M5 9h14v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2ZM3 6h18M10 3h4M2 11h3m14 0h3"/></>],
  [/tv|television|monitor/i, <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-5 0h10"/></>],
];

export function ItemIcon({ label }: { label: string }) {
  return <span className="wk-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {icons.find(([pattern]) => pattern.test(label))?.[1] ?? <><path d="m12 3 9 5v9l-9 5-9-5V8Zm0 10v9M3 8l9 5 9-5M8 5l9 5"/></>}
  </svg></span>;
}
