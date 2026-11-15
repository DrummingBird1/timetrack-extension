// The TimeTrack brand mark and palette, in one place. Everything visual is generated from this:
//   node tools/icons.mjs        -> extension/icons/*.png
//   node tools/promo-tiles.mjs  -> store-assets/promo/promo-*.png
//   node make-release-banner.mjs, and the mark in the README banner, hero and site (see tools/brand-apply.mjs)
//
// The mark is a clock face drawn as a progress ring: a faint track, a bright arc that is "time so far",
// a single hand, and a glowing head where the arc ends. At 16-32 px the detail drops out (no track, one hand)
// so it stays legible in the toolbar.

export const PALETTE = {
  violet: '#8b5cf6',
  indigo: '#6366f1',
  cyan: '#22d3ee',
  ink: '#0b0b14',
  card: '#15151f',
  line: '#2a2a3a',
  text: '#ececf4',
  dim: '#9595ad',
  green: '#34d399',
  pink: '#f472b6',
  amber: '#fbbf24',
};

let counter = 0;

/**
 * The mark as an SVG string.
 * @param {number} size  pixel size (width = height)
 * @param {{ small?: boolean, flat?: boolean }} [opts]  small: fewer details for tiny sizes; flat: no background tile (just the ring, for dark surfaces)
 */
export function markSvg(size, { small = false, flat = false } = {}) {
  const id = `m${++counter}`;
  const sw = small ? 9 : 7;                 // ring stroke
  const track = small ? '' : `<circle cx="44" cy="44" r="26" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="${sw}"/>`;
  const hand2 = small ? '' : '<path d="M44 44 L52.5 49" stroke="#fff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round"/>';
  const tile = flat ? '' : `
    <rect width="88" height="88" rx="24" fill="url(#${id}b)"/>
    <rect width="88" height="88" rx="24" fill="url(#${id}g)"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}b" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${PALETTE.violet}"/><stop offset="0.58" stop-color="${PALETTE.indigo}"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
    <radialGradient id="${id}g" cx="0.22" cy="0.14" r="0.75">
      <stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}h" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PALETTE.cyan}" stop-opacity="0.9"/><stop offset="1" stop-color="${PALETTE.cyan}" stop-opacity="0"/>
    </radialGradient>
  </defs>${tile}
  ${track}
  <path d="M44 18 A26 26 0 1 1 18 44" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round"/>
  <circle cx="18" cy="44" r="${small ? 7 : 9}" fill="url(#${id}h)"/>
  <circle cx="18" cy="44" r="${small ? 4 : 4.6}" fill="${PALETTE.cyan}" stroke="#fff" stroke-width="${small ? 2 : 2.4}"/>
  <path d="M44 44 L44 29.5" stroke="#fff" stroke-width="${small ? 7 : 6}" stroke-linecap="round"/>
  ${hand2}
  <circle cx="44" cy="44" r="${small ? 4.5 : 4}" fill="#fff"/>
</svg>`;
}

/** The mark as a data: URI, for CSS backgrounds. */
export function markDataUri(opts = {}) {
  return `data:image/svg+xml,${encodeURIComponent(markSvg(88, opts).replace(/\s*\n\s*/g, ' '))}`;
}
