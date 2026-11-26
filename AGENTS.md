# Agent notes

Monorepo (npm workspaces): `apps/web`, `apps/api`, `packages/shared`.

- **Money**: always integer **micro-USD**. Never store floats. Format with helpers in
  `@smsgecko/shared` (`formatUsd`, `formatSignedUsd`, `parseUsd`).
- **Balance**: only `apps/api/src/lib/ledger.ts` may mutate `User.balanceMicro`, and it always
  writes a paired `Transaction`.
- **API errors**: throw the helpers from `apps/api/src/lib/errors.ts`; the handler in
  `app.ts` renders them as `{ error: { code, message, details? } }`.
- **DB**: MongoDB must be a replica set (docker-compose does this) so Mongoose transactions
  work. Tests use `mongodb-memory-server` in replica-set mode.
- **Shared package** is consumed as raw TS (`exports` → `src/index.ts`); web sets
  `transpilePackages`, api uses tsx/tsup. Run `npm run build:shared` only for the dist check.
- **Next.js 16**: see `apps/web/AGENTS.md`. Avoid depending on generated global types like
  `LayoutProps` in committed code — type props explicitly.
- The web app talks to the API **same-origin** via a rewrite in `apps/web/next.config.ts`
  (`/api/*` → `:4000`), so auth cookies just work.

## Signup attribution

`lib/attribution.ts` sets `User.signupCountry` (offline `geoip-country` lookup of the left-most public X-Forwarded-For
address, or `cf-ipcountry`; the IP itself is never stored) and `User.signupSource` (first-touch `gecko_src` cookie
written by `components/attribution-capture.tsx`: utm tags, gclid/fbclid/ttclid, external referrer, landing path) at
registration. Analytics only and spoofable: never use it for security. Admin → Audience (`GET /admin/audience?days=`)
groups signups by country and source with payers and deposits; `GET /admin/users?country=` filters the list.
