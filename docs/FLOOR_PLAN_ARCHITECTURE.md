# Floor Plan & Booth-Booking Architecture

This document describes the floor-plan and booth-booking system as it exists
today: a millimetre-authoritative (mm) coordinate model shared by the admin
floor-plan builder, CAD/JSON import, and every vendor-facing booking surface.
It is a reference for anyone changing this code, not a tutorial — it assumes
familiarity with the repo's Next.js/Prisma/Postgres stack.

Read this before touching floor-plan geometry, booth availability, booking
review/terms/checkout, or anything under `lib/floorplan/`.

---

## 1. The mm-authoritative coordinate model

Every booth and feature has **two parallel geometry representations**:

| Field group | Type | Meaning |
|---|---|---|
| `gridX`, `gridY`, `gridW`, `gridH` | `Float`, 0–100 | Canvas-percentage position/size. **Always** a percentage, in every mode, forever — never mm. |
| `xMm`, `yMm`, `widthMm`, `depthMm` | `Int?`, nullable | Real-world position/size in millimetres, relative to the parent `Event`'s (0,0) origin. Null until scale is confirmed and the row is placed/imported under it. |

`Event` carries the venue's own authoritative scale:

- `venueWidthMm`, `venueDepthMm` (`Int?`) — the venue's real-world bounding
  box size.
- `venueScaleConfirmed` (`Boolean`) — the single switch. `false` for every
  event created before this model existed, and for any new event until an
  admin completes the Setup Wizard's Physical Scale step.

**Why two representations instead of migrating `gridX/Y/W/H` away:** the DB
columns are `NOT NULL` and are read by every existing consumer (older code,
CSV exports, anything that hasn't been touched). Rather than a breaking
migration, `gridX/Y/W/H` are kept as a **derived, always-populated
percentage** — computed from the mm fields by `lib/floorplan/transform.ts`
on every write once scale is confirmed. Nothing should ever hand-edit
`gridX/Y/W/H` directly for a scale-confirmed event; they are output, not
input, of the transform pipeline described below.

### The rendering pipeline

```
REAL-WORLD GEOMETRY (mm, stored on Booth/FloorPlanFeature/Event)
  -> viewBox (lib/floorplan/transform.ts picks size + mode)
  -> rendered pixels (SVG's own viewBox scaling)
  -> CSS transform for pan/zoom (components/floorplan/FloorPlan.tsx)
```

Pan/zoom is a CSS transform layered on top of the SVG — it **never** reads or
writes `xMm/yMm/widthMm/depthMm`. Zooming in the browser can never alter
stored physical dimensions.

Two modes, decided once per event by `getFloorplanViewBox()`:

- **`MM` mode** (scale confirmed): the SVG viewBox is
  `{ width: venueWidthMm, height: venueDepthMm }`. Booths/features render
  with their mm fields directly as SVG user units. The venue's true aspect
  ratio is preserved automatically.
- **`LEGACY_PERCENT` mode** (scale not confirmed): the SVG viewBox is a
  fixed `{ width: 100, height: 100 }` square, and `gridX/Y/W/H` render
  directly as before this model existed — see §2.

## 2. Legacy fallback behavior

An event that predates this model, or that an admin simply hasn't confirmed
scale for yet, must **degrade safely, never silently**. Concretely:

- `hasConfirmedScale(event)` is the one type-narrowing predicate that
  decides the mode everywhere (`lib/floorplan/transform.ts`). It requires
  `venueScaleConfirmed === true` **and** `venueWidthMm`/`venueDepthMm` both
  present and `> 0`.
- While unconfirmed, the floor plan renders on the legacy 100×100
  percentage canvas exactly as it always has — the venue is force-fit into
  a square, distances are unlabeled percentages, nothing pretends to know
  real-world size.
- The admin builder shows a visible banner —
  **"⚠ Venue Scale Needs Configuration — set physical scale for accurate
  booth proportions"** (`FloorPlanBuilder.tsx`) — rather than crashing or
  guessing a scale from old percentage data.
- A booth with `xMm/yMm/widthMm/depthMm` all null (never migrated) never
  crashes geometry code. `worldRectOf()` (§5) falls back to an
  approximate mm rect derived from its own `gridX/Y/W/H` via
  `gridRectToMm()` — a **display-only, best-effort** placement, never
  written back as authoritative until the row is actually touched again
  under a confirmed-scale event.

**Invariant:** nothing may fabricate a confirmed scale or real mm geometry
for an unconfirmed event. Confirming scale is always an explicit, one-time
admin action (the Setup Wizard's Physical Scale step) — never a side effect
of import, migration, or a default value.

## 3. Venue bounding box vs. actual boundary

These are two deliberately separate concepts:

- **Bounding box** — `venueWidthMm × venueDepthMm`, always a rectangle.
  This is the coordinate space every `xMm/yMm` value is relative to, and
  the SVG viewBox size in MM mode.
- **Boundary** — the venue's *actual usable shape*, which may be smaller
  than the bounding box (a CIRCLE/OVAL/POLYGON venue never fills its own
  rectangle). Stored as `Event.venueShape` (`RECTANGLE | CIRCLE | OVAL |
  POLYGON`, default `RECTANGLE`) plus `Event.venueBoundaryJson` (shape
  params in mm, same origin as `Booth.xMm/yMm`).

A footprint can pass the bounding-box check and still fail the boundary
check (e.g. a booth placed in the box's corner, outside a circular venue's
actual radius). **Boundary validation always checks both** — see §8.

## 4. Rectangle / circle / oval / polygon handling

All boundary math lives in `lib/floorplan/boundary.ts`, pure functions with
no framework/DB imports (usable client-side for instant drag feedback and
server-side as the authoritative re-check).

```ts
type VenueBoundary =
  | { shape: "RECTANGLE" }
  | { shape: "CIRCLE"; cx: number; cy: number; r: number }
  | { shape: "OVAL"; cx: number; cy: number; rx: number; ry: number }
  | { shape: "POLYGON"; points: Point[] };  // closed, mm
```

`isFootprintWithinBoundary(venue, footprint)` is the one function every
geometry-writing path must call:

1. Computes the footprint's 4 corners **after rotation** (`rectCorners()`
   — rotates around the footprint's own center, matching how the UI
   rotates a booth).
2. Rejects immediately if any corner falls outside the rectangular
   bounding box.
3. Then checks the actual boundary shape:
   - `RECTANGLE` — already satisfied by step 2, always passes.
   - `CIRCLE` — every corner within radius `r` of `(cx, cy)`.
   - `OVAL` — every corner satisfies the ellipse inequality.
   - `POLYGON` — every corner inside the polygon (ray-casting
     point-in-polygon), **and** no rectangle edge crosses a polygon edge
     (`rectCrossesPolygonEdges`) — this catches a rotated rectangle whose 4
     corners all happen to land inside a concave polygon's hull while one
     edge actually pokes out through a notch; corner-only containment would
     wrongly pass that case.

`parseVenueBoundary()`/`serializeVenueBoundary()` convert between the typed
`VenueBoundary` and the DB's `(venueShape, venueBoundaryJson)` pair.
Malformed/missing JSON **falls back to `RECTANGLE`, never throws** — a
boundary check must always return a usable (if permissive) answer rather
than crash a booth create/move over corrupt data.

## 5. World-to-screen transforms

`lib/floorplan/transform.ts` is the **one** authoritative world(mm)→viewport
transform, shared identically by the admin builder, vendor booth selector,
Booking Review, Event Terms map preview, and View Booking. Only
permissions/highlighting differ between those surfaces — the geometry math
is never reimplemented per page.

Key exports:

- **`hasConfirmedScale(event)`** — type-narrowing predicate, §2.
- **`getFloorplanViewBox(event)`** → `{ width, height, mode }` — the SVG
  viewBox to render at.
- **`mmToGridRect(venue, mm)`** — derives `gridX/Y/W/H` (0–100%) from real
  mm geometry. **The only place that should ever compute `gridX/Y/W/H`**
  once an event has confirmed scale. This is the concrete fix for the
  historical bug where a booth's rendered size had no relationship to its
  real dimensions (Mass Create used to always render a fixed 6%×6% square
  regardless of entered meters — see §6).
- **`gridRectToMm(venue, grid)`** — the inverse; only for legacy backfill /
  best-effort display, never an authoritative write once real
  `widthMm/depthMm` exists.
- **`worldRectOf(item, mode, venue)`** — resolves a booth/feature into
  **current viewbox units** (percentages in `LEGACY_PERCENT` mode, real mm
  in `MM` mode). This is the read-side function every render/manipulation
  path should call instead of reading `gridX/Y/W/H` directly. In `MM` mode,
  it prefers the item's own `xMm/yMm/widthMm/depthMm` when all four are
  present, and falls back to `gridRectToMm` only for a not-yet-touched
  legacy row.
- **`worldPatchToServerPatch(patch, mode)`** — the write-side counterpart:
  converts a geometry patch expressed in current-viewbox-units (exactly
  what `FloorPlan.tsx`'s own drag/resize/rotate math emits) into the field
  names an API PATCH/POST body actually expects — passthrough in legacy
  mode, or `gridX→xMm / gridY→yMm / gridW→widthMm / gridH→depthMm` (rounded
  to the nearest mm) in MM mode. **Never send a raw `gridX` holding an mm
  value under the name `gridX`** — the server always treats that field name
  as a 0–100 percentage regardless of mode.
- **`computeBackgroundRect(venue, bg)`** — background image placement in
  the same coordinate space, from `Event.venueBackground*` alignment
  fields. `scale` is a **single uniform scalar** (never separate x/y
  scale) so the image can never be stretched non-uniformly — the actual
  fix for a historical `preserveAspectRatio="none"` distortion bug, not a
  CSS patch. Falls back to a "contain"-style auto-fit when the admin
  hasn't explicitly aligned it yet.
- **`scaleFromTwoPointCalibration(pixelDistance, realDistanceMm)`** — the
  second of two calibration methods (the first being direct venue-size
  entry): mm-per-pixel scale from two clicked reference points a known
  real distance apart.

### Derived-state pattern (read-only consumers)

Every vendor-facing surface (`ApplicationDetailClient.tsx`,
`BoothSelector.tsx`, the Booking Review page, Event Terms map preview) uses
the same one-way pattern: normalize the server's `gridX/Y/W/H` into
current-viewbox-units via a `useMemo` (`displayBooths`/`displayFeatures`)
**without mutating the canonical server-shaped state**. These surfaces never
write geometry back, so they only ever need `worldRectOf`, never
`worldPatchToServerPatch`.

The admin builder (`FloorPlanBuilder.tsx`) is the one write-capable
consumer: it uses the same derived `displayBooths`/`displayFeatures` for
rendering, but reverse-translates every drag/resize/rotate patch through
`worldPatchToServerPatch` before PATCHing the server.

## 6. Booth dimension rules

- `Booth.widthMm`/`depthMm` are the booth's **real physical footprint**,
  set directly by an admin (single-add, bulk-add, or the booth inspector) —
  deliberately separate from `gridW/gridH`, which are canvas-percentage
  render size only and never reliably corresponded to real dimensions
  before this model (a newly placed booth used to default to a fixed 6%
  canvas box regardless of its actual size).
- `widthMm`/`depthMm` are nullable — a booth an admin hasn't sized yet
  simply skips every size-fit check (`lib/boothFit.ts` never blocks a
  booking over data DAH hasn't entered).
- **Every geometry-writing path** (manual create/edit, drag/resize/rotate,
  Mass Create, CAD import, JSON import) must route booth size **and**
  position through `mmToGridRect()` to derive `gridW/gridH`/`gridX/gridY`
  — never hardcode a default grid box. This is what actually fixed the
  historical Mass Create sizing bug (Phase 4): booths created via Mass
  Create now get correct, non-degenerate `widthMm/depthMm` and matching
  `gridW/gridH`, with real mm spacing between adjacent booths.
- Rotation (`Booth.rotation`, `FloorPlanFeature.rotation`) is degrees,
  `0–360`, normalized (`((Math.round(deg) % 360) + 360) % 360`) on every
  write path that accepts it (drag-rotate handle, JSON import, feature
  PATCH) — never negative, never left unnormalized.

## 7. CAD/JSON import architecture

Two import paths, deliberately converging on the **same commit route and
the same row shape**, so there is only one "safe re-import" implementation.

### CAD import (DXF) — `lib/cadImport.ts`

Parses an uploaded DXF drawing into `DetectedBooth[]`, matching
`Booth`'s own shape (`gridX/Y/W/H`, `rotation`, `widthMm/depthMm`) so an
imported booth is byte-for-byte identical to a manually-created one once
committed. **Parses and detects only — never writes to the database
itself.**

Stated scope, deliberately not overclaimed:

- **LWPOLYLINE** entities (closed 4-vertex rectangles) are the primary
  booth-detection signal.
- **INSERT** entities (a CAD block placed per booth) are supported
  best-effort: the block's own LWPOLYLINE geometry is read and transformed
  by the INSERT's position/rotation/scale.
- Four separate LINE entities that happen to form a rectangle are **never**
  welded into a polygon — LINE entities are only ever treated as
  architecture (walls/aisles), never as booth candidates. Documented
  limitation, not a silent gap.
- **DWG (binary AutoCAD) is not handled at all** — the upload route only
  accepts `.dxf`.

Layer-name pattern matching decides what's a booth vs. venue boundary vs.
architecture, checked **in this order** so a boundary layer can never be
misread as one giant booth:

```
VENUE_BOUNDARY_LAYER_PATTERN = /BORDER|OUTLINE|BOUNDARY|PERIMETER|VENUE/i
BOOTH_LAYER_PATTERN          = /BOOTH|STALL|KIOSK|EXHIBITOR|VENDOR/i
NON_BOOTH_LAYER_PATTERN      = /WALL|DOOR|FURNITURE|TABLE|CHAIR|TOILET|
                                 COLUMN|DIM|AXIS|GRID|TEXT|ANNOT|HATCH|
                                 TITLE|BORDER/i
```

Position derivation trusts the **DXF's own declared units** (`$INSUNITS`)
independently, using the drawing's own bounding-box minimum as the (0,0)
origin — deliberately *not* fit-to-declared-venue-box, so a real unit/scale
mismatch surfaces as an explicit warning rather than silently distorting
geometry to force a fit. `widthMm/depthMm` per detected booth are always
populated from the DXF's own units; `xMm/yMm` are only populated when a
`venue` option (the target event's confirmed dimensions) was passed to
`parseDxf()` — matching the "never fabricate mm without a real venue to
place it in" rule.

When a layer matches `VENUE_BOUNDARY_LAYER_PATTERN`, its polygon (largest
by area, via the shoelace formula, if more than one matches) is returned as
a `venueBoundaryCandidate` — offered to the admin as a one-click Venue
Boundary wizard starting point, **never applied automatically**.

Routes: `app/api/admin/events/[id]/floorplan/cad-import/parse` (parse-only,
no writes) → `.../cad-import/commit` (the one write path, shared with JSON
import below).

### JSON import — `lib/floorplanImport.ts` ("DAH Floor Plan JSON" v1)

A versioned, documented, **mm-only** alternative to CAD import for
structured-data floor plans (hand-written, spreadsheet export, or a
re-export from this tool):

```json
{
  "version": 1,
  "venue": { "widthMm": 30000, "depthMm": 20000 },
  "booths": [
    { "code": "B1", "widthMm": 3000, "depthMm": 2000, "xMm": 1000, "yMm": 1000, "rotation": 0 }
  ]
}
```

- `venue`, if present, is **informational only** — used solely for a
  sanity-check warning if it disagrees with the event's own declared
  dimensions. It is never applied to the event as a side effect;
  confirming physical scale stays a deliberate admin action.
- No legacy-percentage fallback: every booth needs a non-empty `code`, real
  `widthMm/depthMm > 0`, and real `xMm/yMm >= 0`. Importing into an
  **unconfirmed-scale event is rejected** with a clear error (there's no
  drawing to synthetically fit, unlike CAD import's fallback), not a crash.
- Unknown fields on a booth object are ignored, not an error —
  forward-compatible with a future v2 that adds more (price, color, tier)
  without breaking a v1 file.
- `parseFloorplanImportJson()` never throws — every rejection is a
  specific, user-facing error string.

Route: `app/api/admin/events/[id]/floorplan/json-import/parse` converts a
validated document into the **same row shape** the CAD-import commit route
expects, then reuses that one commit endpoint — not a second commit
implementation.

### Shared commit route — safe re-import modes

`app/api/admin/events/[id]/floorplan/cad-import/commit/route.ts` accepts
rows from either import path plus a `mode`:

- **`newOnly`** — creates booths for codes that don't exist yet; existing
  codes are left untouched.
- **`matchUpdate`** (default) — creates new codes, and updates
  geometry/dimensions for existing codes that match.
- **`replace`** — like `matchUpdate`, but also deletes any booth in this
  event whose code isn't present in the imported set.

Every row is boundary-checked (§8) before create/update; a row outside the
venue boundary is skipped with reason `"outside venue boundary"` unless
`boundaryOverride`/`applyVenueBoundary` says otherwise.

## 8. Boundary validation

`isFootprintWithinBoundary()` (§4) is wired into **every** geometry-writing
path as the authoritative, server-side re-check — never trusted from the
client:

| Path | File |
|---|---|
| Manual booth create/move | `app/api/admin/events/[id]/booths/route.ts` |
| Bulk edit (multi-select) | `app/api/admin/events/[id]/booths/bulk-edit/route.ts` |
| Mass Create | `app/api/admin/events/[id]/booths/mass-create/route.ts` |
| CAD/JSON import commit | `app/api/admin/events/[id]/floorplan/cad-import/commit/route.ts` |

A violation returns `409` with `BOUNDARY_VIOLATION_MESSAGE` ("Part of this
booth is outside the venue boundary.") and `code: "OUTSIDE_BOUNDARY"`
(create/edit routes) — Mass Create/import instead skip the offending row
with a reason string, since those are bulk operations where one bad row
shouldn't abort the whole batch.

The **only** bypass is `Booth.boundaryOverride` (`Boolean`, default
`false`) — set only by an admin explicitly overriding a blocked placement
for a genuine special case (e.g. a booth intentionally straddling an alcove
the boundary polygon doesn't perfectly capture). It is a stored,
per-booth, explicit escape hatch — never a silent default.

## 9. Live availability

Booth availability is kept fresh on the vendor booth-selection screen
**without a browsing-side timer or a reserved session** — browsing never
holds anything, so there is nothing to expire just from looking:

- `ApplicationDetailClient.tsx` polls `GET /api/events/[eventId]/floorplan`
  every **6 seconds** while the vendor is browsing (`ACCEPTED_UNPAID` status,
  no active hold) via `loadFloorplan()`, and separately polls
  `GET /api/applications/[id]/status` every **4 seconds** via
  `refreshStatus()` for the application's own status/countdown.
- Fresh floor-plan data flows straight into the same `booths`/`features`
  props already driving `FloorPlan`/`BoothSelector` — **neither component
  is remounted**, so zoom/pan/search/filter state survives a refresh.
- `BoothSelector` itself does not poll; it is a pure derived-state consumer
  of whatever `booths` prop it's given, with an `onBoothBecameUnavailable`
  callback so the parent can surface a notice ("X has just become
  unavailable...") when a booth the vendor had selected/staged disappears
  from the live set.
- A **staged-but-not-yet-held** multi-booth selection (client-side only,
  see §10) is reconciled against every fresh poll: any staged booth no
  longer `AVAILABLE` (and not already held by this application) is dropped
  from the staged list with the same unavailability notice.
- None of this is the authoritative check — the atomic hold request
  (§10) is. Polling is purely a UX nicety so a vendor rarely clicks into a
  dead end; the server re-validates from scratch regardless.

## 10. Multi-booth booking model

`MAX_BOOTHS_PER_BOOKING = 2` (`lib/constants.ts`). An event opts in via
`Event.allowMultipleBooths` (nullable override) falling back to
`Settings.allowMultipleBoothsDefault`.

- A booth click **never** holds anything immediately — it opens
  `BoothConfirmModal` first (single-preview, non-authoritative fit/price
  check). Confirming a single booth, or the final "Confirm Booth(s)" in
  multi mode, is the only thing that fires a hold request.
- In multi mode, additional confirmed booths are **staged client-side only**
  (`stagedBooths` state in `ApplicationDetailClient.tsx`) — nothing is
  reserved server-side until the vendor explicitly confirms the whole set.
- **One atomic hold request**: `POST /api/applications/[id]/booths/hold`
  always re-supplies the **full desired set** of booth ids (never an
  incremental "add one more"). Server-side, inside one `$transaction`:
  1. Releases anything currently held by this application that isn't in
     the new set (reconciles to exactly the current selection).
  2. Claims every requested booth with a race-safe `updateMany` WHERE guard
     (`status: AVAILABLE OR heldByApplicationId: this application`) — if
     **any** claim's affected-row count is 0, the whole transaction throws
     and rolls back. **No partial hold ever commits.**
- **Adjacency is never assumed.** `isProvablyAdjacent()`
  (`lib/boothFit.ts`) returns `true` **only** when two booths' real mm
  footprints can be geometrically proven to share an edge (aligned side
  within a 300 mm tolerance, real overlap along that side, both
  axis-aligned to a 0/90/180/270° rotation). Missing geometry or an
  off-axis rotation conservatively returns `false` — it never guesses from
  booth codes, list order, or canvas/percentage proximity.
- `checkMultiBoothFit()` decides the caution shown for a multi-booth
  selection: if the vendor's declared setup fits within **any single**
  selected booth alone, no caution. If it fits **none** of them alone, the
  vendor sees a generic "please confirm the combined space with DAH
  directly" caution — worded differently depending on whether
  `isProvablyAdjacent` can actually prove the pair touches, but **never** a
  false "these booths combine into one space" promise.

## 11. Booking Review flow

`/vendor/applications/[id]/review` — the dedicated pre-Terms review step,
inserted between a confirmed booth hold (`holdStage: "REVIEW"`) and Event
Terms/checkout.

- **Entry**: only reachable once the application has a hold in
  `holdStage === "REVIEW"` — the server component redirects back to the
  main application page otherwise (`review/page.tsx`), covering both "no
  hold yet" and "already past review" (e.g. `holdStage: "PAYMENT"`).
- **Content**: event meta, every held booth (code, size, mm dimensions,
  price), a server-priced VAT breakdown (`splitVatInclusiveTotal`, the same
  computation used by the booth confirm modal and Event Terms page), a
  setup-vs-booth fit notice (reusing `checkMultiBoothFit`/
  `isProvablyAdjacent`, §10), and the live mm-authoritative floor plan with
  the held booth(s) highlighted (same `getFloorplanViewBox`/`worldRectOf`
  pipeline as every other vendor surface, §5).
- **Exit** (`Confirm & Continue`): if the event has published Terms the
  vendor hasn't yet accepted, routes to `/vendor/applications/[id]/terms`.
  Otherwise starts checkout directly (`POST /api/checkout/[id]/start`) and
  returns to the main application page, now showing the payment stage. A
  `VERIFICATION_REQUIRED` response from checkout-start opens the inline
  `PhoneVerifyModal` and resumes on success.
- **Choose a Different Booth(s)**: releases every currently-held booth
  (`POST /api/booths/[boothId]/release` per booth) and returns to the main
  application page's booth-selection screen.
- This page never mutates the hold itself — it is purely a review/routing
  step. The hold, its expiry, and the atomic multi-booth claim are entirely
  owned by §10's hold route.

## 12. Event Terms floor-plan behavior

`/vendor/applications/[id]/terms` (`EventTermsClient.tsx`) shows the
published `EVENT_TERMS` `Agreement` for the event alongside a **persistent
booking summary** (booth code(s), server-priced subtotal/VAT/total — built
server-side in `terms/page.tsx` from the same `getApplicationView`/
`getBoothPrice` data every other surface uses) and a **toggleable read-only
map** (`View Booth on Map`) showing the held booth(s) highlighted.

Acceptance requires: scrolling the agreement body to its end
(`readProgress >= 100`, or immediately satisfied for content short enough
to need no scroll), a typed authorized-representative name (≥ 2 chars), and
an explicit checkbox — `POST /api/applications/[id]/event-terms`.

On accept, an `AgreementAcceptance` row is written with **immutable
snapshot fields** captured at that exact moment (§16) — never re-derived
later from the live `Agreement` or `Booth` rows, even if the terms are
republished or the booth's price/geometry later changes.

**Server-side enforcement, not just UI gating**: `POST
/api/checkout/[applicationId]/start` independently re-checks
`hasAcceptedCurrentEventTerms()` before allowing payment to start — a
client that skips the Terms UI entirely and calls checkout directly is
still blocked. One acceptance covers the whole booking regardless of how
many booths it has.

## 13. View Booking floor-plan behavior

Once `displayStatus === "PAID"`, `ApplicationDetailClient.tsx` renders a
**permanent, read-only** floor plan (fetched once on landing, never
polled — nothing changes once paid) with:

- The vendor's own sold booth(s) permanently highlighted
  (`focusBoothId`/`focusBoothIds`), using the same mm viewBox/derived-state
  pipeline as every other surface.
- **Fit Venue** — resets pan/zoom to show the whole venue (bounded, §14).
- **Focus My Booth(s)** — re-centers/zooms on the vendor's own booth(s).
- **Reset View** — returns to the default initial view.
- A per-booth dimension readout (`widthMm/depthMm` in meters) and the
  vendor's own declared setup size for comparison, when both are known.

This is the terminal, stable state of the booking — no timers, no live
polling, no further mutation paths reachable from this view besides the
receipt/WhatsApp-group/contact links.

## 14. Bounded pan/zoom

`FloorPlan.tsx`'s `clampTranslate(translate, scale)` keeps the rendered
venue content always covering the visible container when zoomed in (never
shows empty space past a venue edge — clamps into
`[containerWidth - contentWidth, 0]`), and **centers it exactly** when
zoomed out below 100% coverage (`(containerWidth - contentWidth) / 2`).
Applied on every pan drag and re-applied via an effect whenever `scale`
changes (e.g. after a zoom-out that would otherwise leave a stale
off-center pan in place). This is shared by every interactive floor-plan
surface, not reimplemented per page.

## 15. Payment/booking transaction guarantees

Two Prisma `$transaction` blocks are the only places a booking actually
becomes irreversible; both use the **same race-safe pattern**: an
`updateMany` whose `WHERE` re-asserts the exact state already confirmed
earlier in the request (never trusting an earlier read once inside the
transaction), and a mismatched affected-row count throws to **roll back the
entire transaction**, not just the mismatched part.

### `POST /api/checkout/[applicationId]/start`

External I/O (the payment gateway's `createCharge` call) runs **before**
and **outside** any transaction — it must never hold a DB connection open
across a network round trip. The stage transition and the `Payment` row
that records it are then written together in one transaction:

1. `updateMany` moves every held booth from `holdStage: "REVIEW"` →
   `"PAYMENT"` (WHERE re-checks `heldByApplicationId` + `status: "HELD"` +
   `holdStage: "REVIEW"`); a partial match throws.
2. `Payment` (status `PENDING`) + one `PaymentBooth` row per booth (its
   individually charged price) are created in the same transaction.

A thrown mismatch → the whole transaction rolls back → the route returns
`409` ("Your booth hold changed — please select a booth again.") with
**no** `Payment` row left behind. Verified live: two concurrent
`start` requests for the same held application produce exactly one
`Payment` row, never two.

### `POST /api/checkout/[applicationId]/confirm`

On `outcome: "SUCCEEDED"`, one transaction makes every write that
constitutes "this booking is genuinely confirmed":

1. `updateMany` on the held booths: `status → SOLD`,
   `assignedApplicationId` set, hold fields cleared, `soldAt` stamped (WHERE
   re-checks `heldByApplicationId` + `holdStage: "PAYMENT"`); a partial
   match throws.
2. Per-booth `priceAedFilsAtSale` set from each `PaymentBooth`'s own
   charged price (unlike the shared `status`/`soldAt` above, this is
   genuinely per-booth).
3. `Payment.status → SUCCEEDED`, `paidAt` stamped.
4. `Application.acceptanceExpiresAt` cleared — its only job was forcing
   timely payment, and it must never later let `lib/expiry.ts`'s sweep
   flip a successfully-paid booking to `ACCEPTANCE_EXPIRED` just because
   wall-clock time passed the now-irrelevant original deadline.
   `Application.status` itself stays `"ACCEPTED"` — there is no separate
   `"CONFIRMED"` status; `getDisplayStatus()` derives `"PAID"` from
   `ACCEPTED` + a succeeded `Payment`.
5. A receipt number is assigned (`assignReceiptNumber`, same transaction).

A thrown mismatch → rollback, `Payment.status` explicitly set to `FAILED`
outside the transaction, `409` returned. Email/WhatsApp notifications and
receipt generation happen **after** the transaction commits, from
`getReceiptData()` — the same authoritative source the vendor's own
printable receipt uses, so a notification can never show different numbers
than what the vendor sees clicking through.

`outcome: "FAILED"` is a simple `Payment.status → FAILED` update with no
booth-state changes — a failed payment attempt never touches booth
availability; the booth simply keeps counting down its existing
`PAYMENT`-stage hold and can be retried until it expires.

## 16. Important invariants future developers must not break

1. **`gridX/Y/W/H` are always 0–100 percentages, in every mode, forever.**
   Never write an mm value under those field names. The only field names
   that ever hold mm are `xMm/yMm/widthMm/depthMm`.
2. **Once `venueScaleConfirmed` is true, `gridX/Y/W/H` are derived output,
   never input.** Every write path must compute them via `mmToGridRect()`
   from the authoritative mm fields — never hand-set them, never default
   to a fixed percentage box regardless of real size (that was the
   historical Mass Create bug this model fixes).
3. **Never fabricate mm geometry for an unconfirmed-scale event.**
   Confirming scale is always an explicit admin action; nothing (import,
   migration, a default value) may set `venueScaleConfirmed` or populate
   `xMm/yMm` as a side effect.
4. **Boundary checks operate on the full rotated footprint, against the
   actual boundary shape — never just the rectangular bounding box.** Every
   geometry-writing path must call `isFootprintWithinBoundary()` before
   persisting a position; the only bypass is the explicit, stored
   `boundaryOverride` flag.
5. **`isProvablyAdjacent()` returns `false` on any missing/ambiguous
   geometry — it must never guess.** A multi-booth "these combine into one
   space" claim is only ever shown when this genuinely proves it.
6. **Booth availability/hold state is always re-asserted server-side inside
   the write transaction, never trusted from an earlier read or the
   client.** Every hold/payment-stage transition uses the
   `updateMany`-with-WHERE-guard + throw-on-mismatch pattern — this is what
   makes concurrent requests for the same booth/application safe.
7. **A booking's checkout/payment writes are all-or-nothing within one
   `$transaction`.** Never split "mark booth sold" from "mark payment
   succeeded" into separate top-level writes — a crash between them must
   never be possible.
8. **`AgreementAcceptance.snapshot*` fields are captured once, at accept
   time, and never re-derived.** Editing/republishing an `Agreement`, or a
   booth's price/geometry changing later, must never alter what an
   already-accepted acceptance record reads.
9. **External I/O (payment gateway calls) never happens inside a
   `$transaction`.** It runs first, standalone; only the DB-only writes
   that follow are transactional.
10. **Pan/zoom is presentation only.** It must never read or write
    `xMm/yMm/widthMm/depthMm`, and it must never be the source of truth for
    anything server-persisted.
11. **Every vendor-facing read surface uses `worldRectOf()` via a `useMemo`
    derived-state pattern — it must never mutate the canonical
    server-shaped `booths`/`features` state it derives from.** Only the
    admin builder writes geometry, and only via
    `worldPatchToServerPatch()`.
12. **`MAX_BOOTHS_PER_BOOKING` and hold-set reconciliation stay atomic.**
    The hold route always receives and enforces the *full* desired booth
    set in one transaction — an "add one more booth" request must never be
    implemented as a second, separate hold call.

## 17. Relevant database fields/models

(`prisma/schema.prisma` — field-level comments there are the primary
source; this is a summary.)

- **`Event`** — `venueWidthM` (legacy, meters, display-only fallback),
  `venueWidthMm`/`venueDepthMm`/`venueScaleConfirmed` (authoritative
  scale), `venueShape`/`venueBoundaryJson` (boundary, §3–4),
  `venueBackgroundNaturalWidthPx/HeightPx`/`OffsetXMm/YMm`/`Scale`/
  `RotationDeg`/`Locked` (background image alignment, §5),
  `floorPlanImageUrl`, `allowMultipleBooths` (nullable override, §10).
- **`Booth`** — `gridX/Y/W/H` (derived percentage, §1), `xMm/yMm/widthMm/
  depthMm` (authoritative mm, §1/§6), `rotation`, `boundaryOverride`
  (§8), `status` (`AVAILABLE | HELD | RESERVED | SOLD`), `holdStage`
  (`REVIEW | PAYMENT | null`), `holdExpiresAt`, `heldByApplicationId`,
  `assignedApplicationId`, `priceAedFils`/`colorHex` (per-booth
  overrides), `priceAedFilsAtSale` (sale-time price snapshot),
  `size` (references a `PricingTier.sizeKey`, or `"custom"`).
- **`FloorPlanFeature`** — `type` (`ENTRANCE_MAIN | ENTRANCE_SIDE |
  TOILET_FEMALE | TOILET_MALE | OFFICE | LOADING | STAIRS | OTHER`),
  same dual `gridX/Y/W/H` + `xMm/yMm/widthMm/depthMm` + `rotation` pattern
  as `Booth`.
- **`Application`** — `setupWidthMm`/`setupDepthMm` (vendor's declared
  footprint for this specific booking, snapshotted at apply time, editable
  via "Edit Setup Size" during booth selection — never silently touched by
  an unrelated profile edit), `status`, `acceptedAt`/`acceptanceExpiresAt`
  (payment deadline, independent of booth holds), `heldBooths`/
  `assignedBooths` relations.
- **`Payment`** / **`PaymentBooth`** — one `Payment` per checkout attempt
  covering the whole multi-booth set; `PaymentBooth` carries each booth's
  own `priceAedFilsAtCharge`.
- **`Agreement`** (`type: EVENT_TERMS`, `eventId`) / **`AgreementAcceptance`**
  — `snapshotType/Title/Version/BodyHtml/BusinessName/ContactName/
  EventName/BoothsJson` (immutable capture, §12/§16), `representativeName`,
  `applicationId` (ties an `EVENT_TERMS` acceptance to the specific
  booking), `ipAddress`/`userAgent`, `acceptedAt`.

## 18. Key files/services

| Area | Path |
|---|---|
| World↔screen transform (the one shared pipeline) | `lib/floorplan/transform.ts` |
| Boundary containment geometry | `lib/floorplan/boundary.ts` |
| Booth size-fit / adjacency honesty | `lib/boothFit.ts` |
| CAD (DXF) parsing | `lib/cadImport.ts` |
| JSON import schema/validation | `lib/floorplanImport.ts` |
| Shared floor-plan SVG renderer (pan/zoom, drag/resize/rotate, grid, hero landmarks) | `components/floorplan/FloorPlan.tsx` |
| Floor-plan shared types | `components/floorplan/types.ts` |
| Admin floor-plan builder + Setup Wizard | `app/admin/(protected)/events/[id]/FloorPlanBuilder.tsx` |
| CAD import parse route | `app/api/admin/events/[id]/floorplan/cad-import/parse/route.ts` |
| JSON import parse route | `app/api/admin/events/[id]/floorplan/json-import/parse/route.ts` |
| Shared import commit route (safe re-import modes) | `app/api/admin/events/[id]/floorplan/cad-import/commit/route.ts` |
| Manual booth create/edit (boundary-checked) | `app/api/admin/events/[id]/booths/route.ts` |
| Bulk edit (boundary-checked) | `app/api/admin/events/[id]/booths/bulk-edit/route.ts` |
| Mass Create (boundary-checked) | `app/api/admin/events/[id]/booths/mass-create/route.ts` |
| Feature PATCH (position/rotation) | `app/api/admin/features/[id]/route.ts` |
| Atomic multi-booth hold | `app/api/applications/[id]/booths/hold/route.ts` |
| Vendor-facing floor-plan data (booth selector, View Booking) | `app/api/events/[eventId]/floorplan/route.ts` |
| Vendor booking page (booth selection, View Booking) | `app/(site)/vendor/applications/[id]/ApplicationDetailClient.tsx` |
| Vendor booth picker component | `components/vendor/BoothSelector.tsx` |
| Booking Review page | `app/(site)/vendor/applications/[id]/review/page.tsx`, `BookingReviewClient.tsx` |
| Event Terms page (map/summary, acceptance) | `app/(site)/vendor/applications/[id]/terms/page.tsx`, `EventTermsClient.tsx` |
| Checkout start (REVIEW→PAYMENT, gateway charge) | `app/api/checkout/[applicationId]/start/route.ts` |
| Checkout confirm (PAYMENT→SOLD, receipt) | `app/api/checkout/[applicationId]/confirm/route.ts` |
| Application view aggregation (shared by every vendor surface) | `lib/applicationView.ts` |
| Agreement/acceptance helpers | `lib/agreements.ts` |
| Receipt data (shared, authoritative) | `lib/receipts.ts` |
| Legacy migration / expiry sweep | `lib/expiry.ts` |

## 19. Tests that protect the system

**There is no automated (CI-run) test suite for this system today** — no
Jest/Vitest unit tests, no committed Playwright spec files, no `npm test`
script. This is a real gap, not a deliberate design choice, and should be
closed before this system sees significant further change without a human
in the loop.

What actually protects correctness today:

1. **Server-side runtime invariant checks**, which behave like assertions
   even without a formal test harness — e.g. `isFootprintWithinBoundary()`
   re-checked on every write regardless of client input, the
   `updateMany`-with-WHERE-guard pattern re-asserting state inside every
   transaction (§15), `parseFloorplanImportJson()`/`parseVenueBoundary()`
   never throwing on bad input. These run on every real request, in
   production, not just in a test file.
2. **Manual regression-test methodology**, used throughout this system's
   development and established as the working pattern for verifying
   changes: scratch TypeScript scripts (`npx tsx`) that seed real DB rows
   via Prisma, sign real session JWTs (`jose`'s `SignJWT` against
   `AUTH_SECRET`, matching `lib/auth.ts`'s actual cookie-verification
   logic) rather than bypassing auth, and drive either direct `fetch()`
   calls against the running dev server or a live Playwright browser
   (`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`)
   against the real UI. Concurrency claims (§15) were verified this way —
   firing genuinely simultaneous requests and inspecting the resulting DB
   rows, not just reading the transaction code and assuming it's correct.
   These scripts are scratch/throwaway by convention (not committed), so
   this methodology is **not** a substitute for a real suite — it is how
   this system has been hand-verified release-to-release so far.
3. **TypeScript + ESLint + `next build`**, run before every commit that
   touches this system, catch type-level geometry-field misuse (e.g.
   passing a `GridRect` where an `MmRect` is expected) and the project's
   React-hooks correctness rules, but cannot catch a logic error like an
   inverted boundary check or a wrong transaction WHERE clause.

**Recommendation for anyone picking this up**: the highest-value first
addition would be unit tests for the pure, dependency-free modules —
`lib/floorplan/transform.ts` (round-trip `mmToGridRect`/`gridRectToMm`,
mode selection), `lib/floorplan/boundary.ts` (each shape, rotated
footprints, the concave-polygon edge-crossing case), and
`lib/boothFit.ts` (`isProvablyAdjacent` true/false/unknown cases,
`checkMultiBoothFit` caution logic) — all pure functions, no DB/framework
dependency, directly portable into Vitest or Jest with no test-infra setup
beyond installing the runner. Transaction race-safety (§15) and the import
commit routes are harder to unit-test meaningfully and would need an
integration-test setup against a real (test) Postgres database, following
the same seed-then-exercise pattern already used for manual verification.
