import { ReactNode } from "react";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    wallet: <path d="M20 7H5a2 2 0 0 1 0-4h13v4M4 7v13h17V7m0 4h-7v5h7" />,
    chart: <path d="M4 3v17h17M8 15l4-5 4 3 5-8" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: (
      <path d="M20 9A8 8 0 0 0 6 5L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5" />
    ),
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
    down: <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" />,
    leaf: <path d="M20 4C8 1 2 8 6 16c8 4 15-2 14-12ZM5 20 15 9" />,
    exit: <path d="M9 4H4v16h5m-1-8h13m-4-4 4 4-4 4" />,
    edit: <path d="m4 16 12-12 4 4L8 20H4ZM13 7l4 4" />,
    trash: <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.chart}
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        ea<span>↗</span>
      </span>
      <div>
        EA Inversión<small>PORTFOLIO COPILOT</small>
      </div>
    </div>
  );
}
