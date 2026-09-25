# DAH design system

The Dar Al Hay look is a quiet, premium palette: warm ivory, sand and deep
olive-brown with a terracotta accent, generous spacing, and restrained
motion. These rules keep new screens consistent with it. The source of
truth is the code: `app/globals.css`, `lib/theme/brand.ts` and
`components/ui/`.

## Colour tokens

Use **semantic tokens**, never raw hex, in components. Each one has a
dark-mode value, so dark mode works automatically.

| Token (Tailwind) | Light | Use for |
|---|---|---|
| `bg-cream-soft` | #f8f4ec | page background, inputs |
| `bg-cream` | #f0e6d5 | cards, panels |
| `bg-cream-deep` | #e2d2b4 | emphasised surfaces, chips |
| `text-brown-dark` | #25201a | headings, primary text |
| `text-brown` / `bg-brown` | #2d291d | primary buttons, links |
| `text-brown-light` | #675944 | secondary text, labels (≥4.5:1 on every cream surface) |
| `text-accent` | #743a26 | rare emphasis (terracotta) |
| `border-brown/10`–`/25` | — | hairlines and card borders (opacity scale) |

Status colours come only through `StatusBadge` tones (below) or the
existing amber/emerald/red notice patterns. Raw hex is acceptable only in:
- SVG drawing (the floor-plan canvas; `lib/theme/brand.ts` palettes);
- third-party brand marks (e.g. `components/auth/GoogleMark.tsx`).

## Typography

- **Headings:** Jost (`font-heading`). **Body:** Inter. **Arabic:** Cairo,
  switched automatically for `dir="rtl"`.
- **Eyebrow labels:** the `label-caps` class (small, spaced capitals), used
  above every section and card title.
- **Money, counts, timers:** add `tabular-nums` so digits don't jiggle.

## Layout

- Public pages: `container-page` (max 72rem, responsive gutters).
- Cards and panels: `rounded-xl border border-brown/10 bg-cream p-5`
  (or `p-6 md:p-8` for hero cards). Nested panels use `bg-cream-soft/70`.
- Use RTL-safe logical spacing (`ms-*`, `me-*`, `ps-*`, `pe-*`) where
  direction matters.

## Components (`components/ui/`)

| Component | Use |
|---|---|
| `Button` / `LinkButton` | **All** actions. Variants: `primary` (one per view), `secondary`, `ghost`, `destructive` (outlined red, for revoke, reject, delete). Sizes `sm`/`md`/`lg`. `loading` shows a spinner and disables the button. |
| `Card`, `SectionLabel`, `PageHeader`, `EmptyState`, `MetricCard` | Admin page scaffolding and summaries |
| `StatusBadge` | State chips. Tones: `positive`, `attention`, `negative`, `info`, `neutral` |
| `Skeleton*` | Loading placeholders: text, card, event card, floor plan, table, row. Every route with data has a `loading.tsx` using these. |
| `FieldError` + `fieldErrorRingClass` | Inline form errors (no browser-native validation bubbles) |
| `LuxeCheckbox` | The styled consent checkbox (signup terms, event terms) |

Feature components live beside their area: `components/admin/`,
`components/vendor/`, `components/floorplan/`, `components/receipts/`. Two
shared building blocks:
- `components/ActiveSessionsCard.tsx`: used by the vendor profile and the
  admin settings page;
- `components/LegalDocument.tsx`: renders the public legal pages.

## Interaction rules

- One primary action per view; everything else is secondary or ghost.
- Destructive or irreversible actions ask for confirmation and say what
  happens: record payment, refund, revoke, delete, sign out other devices.
- Every async action shows a loading state (`Button loading`) and a clear
  success or error message near the control. Nothing fails silently.
- Keep motion subtle and respect `prefers-reduced-motion` (already handled
  globally for button press feedback).
- Every user-facing string exists in English and Arabic.

## Known exceptions (deliberate)

- The sandbox checkout buttons on the vendor booking page keep their
  Apple Pay-style black pill. They're dev-only now (production checkout is
  offline).
- The floor-plan canvas uses its own SVG palette (`DAH_SIZE_PALETTE`) and is
  protected by the floor-plan regression rules. Don't restyle it casually.
