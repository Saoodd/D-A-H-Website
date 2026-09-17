// Dar Al Hay (DAH) brand palette as raw hex — the single source of truth
// for every context that can't read the CSS custom properties in
// app/globals.css: transactional emails (inline-styled HTML), the
// generated favicon/OG image (next/og ImageResponse), and floor-plan
// canvas defaults (SVG fill/stroke attributes, evaluated outside the DOM's
// CSS cascade in some cases). Keep this in sync with the --dah-* /
// --color-* values in app/globals.css by hand — there is no automated
// bridge between a CSS file and server-rendered email HTML.
export const DAH_IVORY = "#F8F4EC";
export const DAH_DESERT = "#C3AF94";
export const DAH_STONE = "#CFBEAA";
export const DAH_OLIVE = "#2D291D";
export const DAH_TERRACOTTA = "#743A26";
export const DAH_CHARCOAL = "#25201A";

// Derived UI-adjacent tones — the same values as the light-theme
// --color-brown-light / border tint in app/globals.css, duplicated here
// (rather than computed) because email HTML and ImageResponse can't read
// CSS custom properties or run color-mix().
export const DAH_MUTED_TEXT = "#7A6C55";
export const DAH_BORDER = "#E4D9C6";

// A 4-step swatch offered as the default booth/feature color in the admin
// floor-plan builder and its read-only mirrors (booth selector, booking
// review, event terms map preview) — previously copy-pasted verbatim
// across 4 files with the old brand hex; now a single shared constant.
export const DAH_SIZE_PALETTE = [DAH_TERRACOTTA, DAH_OLIVE, DAH_DESERT, DAH_CHARCOAL] as const;
