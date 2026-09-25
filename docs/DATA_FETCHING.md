# Data fetching and caching

## The rule

**Booth availability, holds, payment state, deadlines, ownership and
authorisation are always read fresh from Postgres, on the server, in the
request that acts on them.** No cache, whether browser, CDN, Next.js or
in-memory, is ever the source of truth for them. A value shown in the
browser is only a display; every action re-checks it on the server.
Examples:
- the hold route re-reads the booth inside its transaction;
- checkout recomputes the price with `getBoothPrice`;
- a payment becomes paid only through the guarded transitions in
  `lib/paymentProcessing.ts`.

## How the app follows it

| Layer | Behaviour | Where |
|---|---|---|
| Pages | Every page that reads the database is dynamic (`ƒ` in the build output), rendered per request. Nothing uses `"use cache"`, `unstable_cache` or ISR. | `npm run build` route table |
| API responses | `Cache-Control: private, no-store` on every `/api/*` response, so no browser or proxy may store them. | `next.config.ts` |
| Client polling | The booth map, application status and payment return pages poll their API routes; responses are never stored (above). | `ApplicationDetailClient`, `PaymentReturnClient` |
| Mutations | Admin and vendor actions call an API route and then `router.refresh()`, which re-renders from the database. | client components |
| Private files | Trade licences are streamed with `private, no-store`. | `lib/privateDocs.ts` |

## Where caching is allowed

Only for data that can't cause a wrong booking or payment decision:

- `sitemap.xml`: regenerated at most hourly (`revalidate = 3600`).
- `robots.txt`, icons, the Open Graph image: static at build time.
- Hashed JS/CSS/font assets: cached forever by Next.js (content-addressed).
- Images on Vercel Blob: cached by the Blob CDN. A replaced image gets a
  new URL.

Adding a cache anywhere else needs a written reason in the code and a
check that nothing in "The rule" can flow through it.

## Admin tables

- **Filters run in the database**, not over a pre-truncated list: All
  Transactions and Emails use URL query parameters (shareable and
  bookmarkable).
- **Payment filters have one definition** (`lib/paymentFilters.ts`),
  shared by All Transactions, the per-event Payments table and the
  CSV/Excel export. An exported file therefore always contains exactly
  the rows that were on screen. Dates are Dubai calendar days.
- **Caps are never silent.**
  - Lists show "Showing the N most recent of M" when a cap is hit.
  - Exports refuse with a clear message rather than truncating: a partial
    ledger looks complete.
- The per-event tables (applications, payments, agreements) load the
  whole event and filter in the browser; an event has at most a few
  hundred rows.
