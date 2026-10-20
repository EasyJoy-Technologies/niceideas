/** Inline stroke icons (Lucide geometry, ISC licence) for server-rendered pages. */
const PATHS = {
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  outLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  withdrawn: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  restricted: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  missing: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = "ni-i"): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
