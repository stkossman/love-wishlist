# Dependency update — 3 November 2026

Reviewed every direct dependency and devDependency against npm stable tags, peer/runtime requirements, repository imports/tooling, and `bun audit`. No declared package is unused. Bun remains the package manager; no new application dependency or override was added.

## Versions and usage

These are installed lockfile versions, not merely manifest ranges. Unchanged entries were already current.

| Package                       | Before  | After   | Usage / decision                                                                                            |
| ----------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `astro`                       | 5.18.2  | 7.4.5   | SSR pages/API; latest stable, security fixes                                                                |
| `@astrojs/vercel`             | 9.0.5   | 11.0.18 | SSR adapter; latest stable, requires Astro 7, trusted path overrides                                        |
| `@lucide/astro`               | 0.561.0 | 1.67.0  | Existing icons; current Astro-compatible release, same used exports                                         |
| `@tailwindcss/vite`           | 4.3.4   | 4.3.4   | Vite plugin; peer range includes Vite 8                                                                     |
| `tailwindcss`                 | 4.3.4   | 4.3.4   | Existing CSS styling; kept matched with its plugin                                                          |
| `cloudinary`                  | 2.11.0  | 2.11.0  | Signed server uploads/deletion                                                                              |
| `firebase-admin`              | 14.5.0  | 14.5.0  | Server Firestore transactions and credentials                                                               |
| `@astrojs/check`              | 0.9.12  | 0.9.12  | Astro diagnostics; supports TypeScript 5/6                                                                  |
| `@types/bun`                  | 1.4.4   | 1.4.4   | Bun test and script declarations                                                                            |
| `@types/node`                 | 22.20.5 | 22.20.5 | Latest Node 22 declarations, matching CI's runtime line; 26.x is intentionally not selected                 |
| `typescript`                  | 5.9.3   | 6.0.3   | Newest stable release compatible with the Astro checker's peer range; 7.0.2 is incompatible with that range |
| `prettier`                    | 3.9.10  | 3.9.10  | Formatting CLI, compatible with both plugins                                                                |
| `prettier-plugin-astro`       | 0.14.1  | 1.1.2   | Rust-backed Astro formatter matching current compiler generation                                            |
| `prettier-plugin-tailwindcss` | 0.7.4   | 0.8.1   | Class sorting; compatible with Prettier 3 and Astro plugin 1                                                |

Updated manifest minimums for packages that had already resolved to current stable versions. `bun.lock` records the complete new transitive graph. `bun outdated` now lists only the intentionally constrained TypeScript and Node declarations. Bun 1.3.5 remains pinned and verified; changing the package-manager release was unnecessary for this migration.

## Migration changes

- Astro and Vercel were upgraded together after reviewing the [Astro 6](https://docs.astro.build/en/guides/upgrade-to/v6/), [Astro 7](https://docs.astro.build/en/guides/upgrade-to/v7/), and [adapter changelog](https://github.com/withastro/astro/blob/main/packages/integrations/vercel/CHANGELOG.md). The new framework uses Vite 8 and its Environment API. Tailwind's current plugin supports it. No content collections, Markdown processing, custom adapter, client islands, or removed experimental configuration need migration in this app.
- Set `compressHTML: true` explicitly to preserve prior HTML whitespace behavior instead of Astro 7's new JSX whitespace default. The styling and application flows are unchanged.
- Removed private `import.meta.env` fallbacks. Astro 6+ inlines those references; retaining them could preserve build-time secrets as fallbacks when runtime values are missing. Server configuration now reads only `process.env`; `import.meta.env.PROD` remains a non-secret build constant. `bun run dev` and Bun operator scripts load local `.env`; production supplies environment variables at runtime. Do not launch the dev command directly with Node and assume `.env` is loaded.
- Raised the Node requirement and CI pin to **22.23.4**, the minimum declared by Astro 7.4.5. Kept Node type declarations on the CI runtime line. A plain `bun run build` still runs Astro with Node; `bunx --bun astro build` can select Vercel's Bun runtime and is not the documented build command.
- TypeScript 6 no longer supplies the same implicit type-package discovery. Explicitly enabled Node and Bun declarations. Replaced deprecated `baseUrl` with relative `./src/...` path targets, retaining every alias. TypeScript stays on `~6.0.3` until the checker supports version 7.
- Prettier's Astro plugin changes output layout. Applied it only to the 17 `.astro` files flagged by the formatting check; those edits are whitespace/formatting compatibility, not a component redesign. No global reformat or unrelated refactor was performed. A verification script confirmed that all 17 changed Astro files exactly equal the new formatter applied to their HEAD versions; no manual component edits are mixed into them.

## Security audit

The audit decreased from **20 advisories across eight package names** to **three advisories across three transitive package names**. Astro, its adapter, Sharp, esbuild and Zod no longer appear in the audit. The previous unauthenticated adapter path-override vulnerability is fixed by the upgraded adapter, rather than deferred to a firewall workaround.

`bun audit` still exits **1**. These remaining advisories are not suppressed:

| Package / advisory                                                                                              | Dependency path and reachability                                                                                                                                                                                                                        | Decision                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path-to-regexp` 6.1.0 — high, [GHSA-9wv6-86v2-598j](https://github.com/advisories/GHSA-9wv6-86v2-598j)         | Hard-pinned by `@vercel/routing-utils` 6.6.1, alongside its patched 6.3.0 alias. Used to compile repository-controlled routing configuration. The vulnerable multi-parameter-per-segment pattern is absent; request paths do not become route patterns. | No exploitable path identified in current routes. Do not replace the upstream compatibility pin blindly; update when routing-utils removes it.    |
| `glob` 13.0.6 / 10.5.0 — moderate, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)     | Via Vercel file tracing and Firebase/Google SDK → rimraf. Cancellation can leave background traversal running. The app supplies no request-controlled filesystem patterns or abort-limited glob walks.                                                  | No exploitable request path identified. Patched 14.0.2 is outside the parents' major ranges; retain compatible versions pending upstream updates. |
| `minimatch` 10.2.6 / 9.0.9 — moderate, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Via those glob packages. Exploitation needs attacker-controlled patterns at optimization level 2+. API input is parsed by bounded handwritten validators and never used as filesystem patterns.                                                         | No exploitable request path identified. Patched 11.0.1 crosses parent major ranges; no forced override.                                           |

This is a reachability assessment of this repository, not a declaration that the vulnerable packages are harmless in all contexts. Reassess if rewrites, filesystem operations or user-supplied patterns are introduced. Review dependency updates again before deployment. Upstream-pinned residual advisories remain non-blocking maintenance debt for this app.

## Verification and release

The complete Bun suite, TypeScript, Astro diagnostics, formatting and production build were run after upgrading. All 138 tests passed (581 assertions); Astro reported zero errors, warnings and hints. Typechecking, formatting, the frozen install and `git diff --check` passed. The audit completed with the three documented advisories and exit 1. The Vercel build used synthetic integration values. No live database writes, provider cleanup, Telegram delivery, external setting changes, deployment, commit or PR modification was performed.

Verified with Bun 1.3.5 and Node 24.12.0, then reran checks and the build using an official, SHA-256-verified temporary Node 22.23.4 binary. That build generated `nodejs22.x` Vercel functions. The system Node installation was not changed; hosted Linux CI has not run.

The actual built adapter was also imported into an isolated Node smoke process with outbound fetch blocked. Forged header, query, token and middleware-secret path overrides were ignored; a rewritten POST could not log in through `/sizes`. Unauthenticated mutations returned 401. The real auth route accepted a runtime-only PIN, produced a Secure/HttpOnly/SameSite cookie, and recognized the session. Removing runtime secrets returned 503, confirming there is no build-time fallback. This verifies the generated entrypoint locally, not Vercel's deployed routing or WAF configuration.

Playwright Chromium exercised the real upgraded Astro routes/services/repositories against in-memory Firestore and a mocked Cloudinary SDK at `http://127.0.0.1:4329`. Checked both feeds/pagination/retry, unauthorized writes, invalid/valid PIN, persistent sessions, create/edit/delete, image upload/replacement/removal, lost-save-response retry with one item/upload, and durable failed-deletion recovery. Desktop 1440×1000 and mobile 390×844 screenshots retained the previous themes/layout; no horizontal overflow, blank page, framework overlay, page errors or healthy-navigation console warnings/errors were found. Injected failures produced expected errors. Browser plugin unavailable; regular Playwright was used. Temporary fixtures/screenshots are outside tracked source and are not a committed browser suite.

Real Firestore concurrency/indexes/IAM/rules, Cloudinary timing/permissions, Vercel routing/rate limiting and production secrets are still external release gates in [production readiness](production-readiness.md). Local checks do not verify them. The application remains ready for normal merge review and a green hosted CI run; deployment still requires those operational checks.
