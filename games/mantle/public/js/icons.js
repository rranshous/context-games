// Mantle's icons: small line drawings on a 24-unit grid that take the color of the text
// around them, so they wear the aid's color in the lab and the HUD's in a match.

const PATHS = {
  // matter: a cut gem
  matter: '<path d="M7 4h10l4 5.5L12 21 3 9.5Z"/><path d="M3 9.5h18M9.5 4 8 9.5l4 11.5 4-11.5L14.5 4"/>',
  // room in the army: rank chevrons
  army: '<path d="M5 9.5 12 5l7 4.5M5 14.5 12 10l7 4.5M5 19.5 12 15l7 4.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  // time to grow or build
  time: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  sound: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  muted: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4Z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  play: '<path d="M7.5 5v14L19 12Z"/>',
  speed: '<path d="M4 6.5v11l7.5-5.5ZM12.5 6.5v11l7.5-5.5Z"/>',
  box: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M10 4h4M10 20h4M4 10v4M20 10v4" opacity=".45"/>',
  fight: '<path d="M5 4.5 15 14.5M4.5 4.5h3v3M12.5 17 17 12.5M15 15l4.5 4.5"/><path d="M19 4.5 9 14.5M19.5 4.5h-3v3M11.5 17 7 12.5M9 15l-4.5 4.5"/>',
  move: '<path d="M12 20V5M6 10.5 12 4.5l6 6"/>',
  rally: '<path d="M6 21V3.5"/><path d="M6 4.5h11l-2.5 3.5 2.5 3.5H6"/>',
  all: '<circle cx="12" cy="7" r="2.6"/><circle cx="6.5" cy="15.5" r="2.6"/><circle cx="17.5" cy="15.5" r="2.6"/><path d="M3 21c.8-1.6 2-2.3 3.5-2.3S9.2 19.4 10 21M14 21c.8-1.6 2-2.3 3.5-2.3s2.7.7 3.5 2.3M8.5 12.8c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2"/>',
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  base: '<path d="M4 20V10l8-6 8 6v10Z"/><path d="M10 20v-5h4v5"/>',
  alarm: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  // a unit with no likeness
  unknown: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 2.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.6M12 16.6v.2"/>',
  ready: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.5 3 3 5-6"/>',
};

/** An icon as an element: `icon('matter')`, sized by the CSS around it (1em by default). */
export function icon(name, className = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `icon${className ? ` ${className}` : ''}`);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = PATHS[name] ?? '';
  return s;
}
