# Security

## Access boundaries

Pages, item JSON/fragments, edit-page data, and measurements are publicly readable
unless hosting-level restrictions apply. The PIN protects mutations only.

The server verifies a shared four-digit `SECRET_PIN` and issues an eight-hour
HMAC-signed, host-only `wishlist_session` cookie: HttpOnly, SameSite=Strict, and
Secure in production. Both people can edit either collection and either person's
sizes. Rotating the PIN or `SESSION_SECRET` invalidates all sessions; there is no
per-person identity or individual session revocation.

Item writes, uploads, and size edits use the same server-side authorization and
origin checks. Login and mutations require `Origin` to match the request URL;
cross-site Fetch Metadata is rejected. A command-line caller needs the correct
Origin and signed cookie. UI overlays and the retired `x-auth-pin` header do not
authorize requests.

Firebase Admin uses service-account IAM and bypasses client Security Rules. Grant
only the required Firestore data permissions, not project Owner/Editor. Keep
`items`, `wishlistImages`, and `sizes` inaccessible to direct clients. Review the
complete deployed rules: any matching permissive allow can override a deny. The
checked-in [rules](firestore.rules) deny all direct client access; review other
applications sharing the database before applying them, and verify denial using
the Rules Playground. Repository files are not proof of deployed configuration.

## Secrets and deployment precautions

- Keep credentials server-only in ignored `.env` files or Vercel runtime settings;
  never commit or log them or prefix them with `PUBLIC_`. Use separate Production
  and Preview credentials/projects/accounts. See [README](README.md#development)
  and [.env.example](.env.example) for the variables.
- Use a four-digit PIN and an independently random signing secret of at least 32
  random bytes. Rotate any formerly public PIN, remove `PUBLIC_SECRET_PIN` and
  obsolete browser Firebase variables, and retire old writable deployments.
- Configure shared WAF throttling for **POST `/api/auth/session`** on every writable
  domain/deployment, including Preview: target at most five attempts per client IP
  per fifteen minutes, or an equally restrictive supported policy. The app's
  five-attempt limiter is per instance and cannot provide distributed protection.
  The four-digit PIN remains vulnerable to distributed guessing; restrict hosting
  access if broader exposure is unsuitable.
- Verify client IP, Origin, HTTPS cookies, throttle responses, and that forged
  path overrides cannot bypass the login rule. Do not weaken origin checks for an
  unverified proxy or downgrade the adapter's path-override protection.
- Follow the [deployment steps](README.md#deployment-and-troubleshooting). Test
  writes in isolated staging; do not use production mutation probes. Roll back
  only to an Admin/ledger-compatible build. Never remove media tombstones, force
  ledger states, reuse retired IDs, or restore permissive client rules.

Run `bun audit` before releases. Known transitive follow-ups are
[`path-to-regexp`](https://github.com/advisories/GHSA-9wv6-86v2-598j) through Vercel
routing utilities, and [`glob`](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) /
[`minimatch`](https://github.com/advisories/GHSA-g3hv-75wg-m249) through file tracing
and Google SDK tooling. The prior review found no exploitable path in the app's
repository-controlled route/filesystem patterns. Reassess after relevant changes;
prefer compatible upstream fixes over forced major-version overrides.
