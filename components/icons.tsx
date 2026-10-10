// Hairline icons, drawn on a 20×20 grid to match the UI type.
type P = React.SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const IconPlay = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6.5 4.5v11l9-5.5z" fill="currentColor" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 13V3.5M6 7.5l4-4 4 4M3.5 13v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" />
  </svg>
);

export const IconLink = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1" />
  </svg>
);

export const IconMore = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="4.5" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.5a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-9.5" />
  </svg>
);

export const IconEdit = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12.5 4.5l3 3-8 8H4.5v-3zM11 6l3 3" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9M15.5 3.5v3h-3" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

export const IconPlaylist = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 5.5h13M3.5 10h8M3.5 14.5h6" />
    <path d="M13.5 11.5v5l4-2.5z" fill="currentColor" />
  </svg>
);

export const IconNext = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 5v10l7.5-5zM15 5v10" />
  </svg>
);

export const IconBack = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4.5L6.5 10l5.5 5.5" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8.5" cy="8.5" r="5" />
    <path d="M12.2 12.2l4.3 4.3" />
  </svg>
);

export const IconSettings = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 6h6M14 6h2M4 14h2M10 14h6" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="8" cy="14" r="2" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);

export const IconTheme = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="10" r="6" />
    <path d="M10 4a6 6 0 0 1 0 12z" fill="currentColor" />
  </svg>
);

export const IconExternal = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11 4.5h4.5V9M15.5 4.5L9 11M13.5 12v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1h3" />
  </svg>
);

export const IconWarn = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 3.5l7 12.5H3zM10 8.5v3.5M10 14.2v.1" />
  </svg>
);

export const IconFilm = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4" width="13" height="12" rx="1.5" />
    <path d="M6.5 4v12M13.5 4v12M3.5 8h3M3.5 12h3M13.5 8h3M13.5 12h3" />
  </svg>
);
