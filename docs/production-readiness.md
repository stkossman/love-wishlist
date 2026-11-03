# Production readiness — Stage 5

Assessment of `refactor/codebase-modernization` against `main`, including the final dependency update. External configuration has not been inspected or changed. No production writes, provider reconciliation, notifications, deployment, commits, or PR changes were performed.

## Findings and decisions

Fresh-checkout verification also reproduced a typecheck failure without generated Astro environment types. `typecheck` now runs `astro sync` before `tsc --noEmit`; validation generates ignored build metadata without rewriting source.

| Classification   | Finding                                                                                                                   | Resolution / remaining action                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed defect | Security documentation still listed completed Stage 2 work as deferred and described Telegraf notifications               | Corrected README and security guidance                                                                                                                     |
| Confirmed defect | Unknown reconciliation options printed help and exited successfully                                                       | Invalid options now exit nonzero without importing integration code                                                                                        |
| Confirmed defect | The previous adapter allowed pathname-only login WAF bypass via request-path overrides                                    | Fixed by upgrading Astro/adapter together; built-entrypoint smoke confirms forged overrides are ignored. Verify staged routing and shared login throttling |
| Optional cleanup | Unused Telegraf dependency, thumbnail URL helper/re-export, description helpers, image data attributes, and styling hooks | Removed only references with no consumers; final dependency updates are documented separately                                                              |
| Optional cleanup | Empty package name, no package-manager/runtime declaration, no non-mutating formatting script or CI                       | Added metadata, `format:check`, single-job CI; resolved the existing description formatting failure                                                        |
| Potential risk   | Firestore and Cloudinary are separate transaction domains                                                                 | Durable reservations/retirement and conservative manual recovery; exact limits in the media guide                                                          |
| Potential risk   | Read pages and edit data remain public; shared PIN has low entropy                                                        | Explicit boundary; externally verify rules, WAF, hosting access policy and intended exposure                                                               |

The architecture is proportionate to a two-person app. API routes own authentication/parsing; repositories own persistence transactions; services coordinate providers; Astro components and browser controllers own presentation. No further layering or reorganization is justified.

## Media review

Reviewed reservation, completion, attachment, replacement, removal, item deletion, reference checks, recovery claims, and tombstones. All transaction reads precede writes. Managed attachment and cleanup compete on the same ledger record. Once `deleting` is committed, attachments reject it; item persistence commits before retiring assets are destroyed. ID and canonical-URL reference checks retain referenced candidates. Failures leave records available for inspection.

Creates with the same uploaded image and identical payload are retryable. Image updates compare the previous image identity and accept a stale retry only when supplied fields already match. General create requests without an image are not deduplicated. Upload retries after an unconfirmed response can allocate another reservation. These are documented limitations, not exactly-once guarantees.

The memory Firestore substitute uses actual Admin `Timestamp`/`FieldValue` values, stages atomic writes, checks read-before-write ordering, serializes competing transactions, and injects failures before/after commit. It does **not** prove real Firestore query locking, automatic callback retries, IAM, indexes, or provider behavior. An isolated staging/emulator integration run remains an operational gate. Legacy images require no migration and are never automatically adopted or deleted.

## Dependency advisory assessment

The final update moves Astro to 7.4.5 and the Vercel adapter to 11.0.18. The prior adapter path-override vulnerability and the audited Astro/Sharp/Zod/esbuild advisories are resolved in the new graph. `bun audit --json` now reports three residual transitive advisories and exits 1: one high in upstream-pinned `path-to-regexp`, two moderate in `glob` and `minimatch`. No exploitable path was identified in the current application: routing patterns and filesystem patterns are repository/SDK-controlled, not request-controlled. No incompatible major overrides were forced.

See [the dependency update](dependency-update.md) for every direct package version/use, breaking changes, dependency paths, advisory links and the decision to retain compatible upstream pins. Re-run the audit before release.

## Verification

Final dependency verification passed with Bun 1.3.5 and both Node 22.23.4 and Node 24.12.0. Node 22.23.4 was downloaded from nodejs.org to a temporary directory and SHA-256 verified; the system installation was unchanged. CI pins that Node release; GitHub-hosted execution has not run because this task does not push changes.

| Check                           | Result                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun install --frozen-lockfile` | Pass; package/lockfile consistent                                                                                                                                                          |
| `bun run test`                  | 138 pass, 0 fail, 581 assertions across 6 files                                                                                                                                            |
| `bun run typecheck`             | Pass, including a run with generated Astro environment types removed                                                                                                                       |
| `bun run check`                 | 0 errors, 0 warnings, 0 hints                                                                                                                                                              |
| `bun run format:check`          | Pass; no source rewriting                                                                                                                                                                  |
| `bun run build`                 | Pass with synthetic integration values on Node 22 and 24; final generated function runtime `nodejs22.x`. Built-adapter override/authentication/runtime-secret smoke also passed            |
| `git diff --check`              | Pass                                                                                                                                                                                       |
| CI workflow                     | YAML parsed; triggers, single job, read-only permissions, pinned tools/actions, frozen install, required commands and absence of secrets reviewed. Action tag SHAs verified against GitHub |
| `bun audit --json`              | Completed; 3 residual advisories, exit 1; reachability assessment in the dependency guide                                                                                                  |
| Recovery CLI arguments          | Help exits 0; invalid/partial options exit 1 without reading integrations                                                                                                                  |

One full-suite run exposed an existing timing-dependent form test (a fixed 10 ms unlock delay). The affected unlock assertions now wait for observable state with a bounded deadline. The final suite passed after that fix.

Chromium flows passed: both owner feeds and pagination failure/retry; unauthorized mutation rejection; incorrect/correct PIN, session persistence and session-expiry relock without data loss; create/edit/delete and redirects; specification add/remove and focus; image upload/replacement/removal; lost create response with retry reusing one upload and one item; failed deletion with durable state and recovery after the grace period; missing-edit redirect and wrong-owner detail 404; keyboard focus/Tab behavior and live PIN/image/description error regions. Reduced-motion unlock was also checked. The image endpoint returned 403 for an unapproved remote AVIF URL locally.

Desktop 1440×1000 and mobile 390×844 screenshots were inspected. Feeds/form had no horizontal overflow; healthy navigation had no page errors or application warnings/errors, no blank screen, and no framework overlay. Injected HTTP failures, response loss and expected 404s generated expected error entries. Screenshots and the QA fixture remain in the system temporary directory, outside tracked source. No screen-reader speech output, Safari/Firefox, production hosting behavior, real provider timing or Firestore automatic transaction retries were verified.

Browser review also found unnamed icon-only Add links, invisible desktop keyboard-focused Options controls, and opacity-hidden static error text exposed to assistive technology. Added accessible text, keyboard-focus visibility, and empty live regions until errors occur; description errors now expose `aria-invalid` and a description relationship. Visual layout and themes remain intact.

Browser harness: temporary files outside tracked source, local Astro on `http://127.0.0.1:4329`, in-memory Firestore and Cloudinary SDK substitute, synthetic credentials, blocked outbound server fetch. Browser plugin unavailable; Playwright Chromium used. No production integration was exercised. Injected API/network failures produce expected console errors; healthy navigation must remain free of application errors. External font availability is not an application guarantee.

## Required external configuration

- [ ] Select Node.js 22.23.4+ in Vercel; install using Bun 1.3.5 and the committed lockfile. Confirm the build and server runtime agree. The exact pinned Node release was tested locally; confirm the deployed runtime independently.
- [ ] Set fresh server-only `SECRET_PIN` and independently random `SESSION_SECRET` (at least 32 random bytes). Rotate the formerly public PIN; remove `PUBLIC_SECRET_PIN` and obsolete browser Firebase variables.
- [ ] Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` for the intended project. Review least-privilege IAM (Firestore entity read/create/update/delete/query; Cloud Datastore User is an example, not a verified assignment). Admin bypasses rules.
- [ ] Review and deploy appropriate Firestore client rules: checked-in deny-all is suitable only after confirming no other client needs the database. Verify denial for both `items` and `wishlistImages`; adding a deny beside a permissive allow is ineffective.
- [ ] Confirm the `items` composite index: `owner` ascending, `createdAt` descending, document name descending (normally implicit alongside the final descending field). Exercise both owner feeds and tied-timestamp pagination in isolated staging. Unfiltered createdAt/document-ID ordering and ledger equality checks use normal single-field indexes; ensure exemptions have not disabled them.
- [ ] Permit server access to `wishlistImages`; there is no manual collection creation or item-schema migration. New uploads create ledger documents. Retain tombstones; do not TTL-delete them or allow older writers to reuse managed IDs.
- [ ] Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in the intended account; verify signed upload and destroy permissions there. Keep non-overwrite IDs and separate Preview media. Assess request-body limits: the app accepts 5 MiB files, but hosting may impose a lower multipart limit. Do not advertise the app limit as a verified Vercel upload limit.
- [ ] Leave both Telegram variables absent for disabled notifications, or configure a staging-only bot/chat for isolation testing. Verify production bot permissions deliberately outside this review. Delivery is best-effort, bounded to three seconds, and can duplicate on retried creates.
- [ ] Implement shared login throttling in SECURITY.md and verify that the patched adapter ignores forged overrides on staging. Confirm client IP, Origin, HTTPS Secure cookies, rate-limit responses, direct deployment URLs, and custom domains. Application memory counters alone are insufficient.
- [ ] Separate Production and Preview PINs, signing secrets, Firebase projects/accounts, Cloudinary accounts, and Telegram destinations. Protect unused Preview URLs and retire **all** old writable deployments before relying on ledger ownership or PIN rotation.
- [ ] Inventory legacy media read-only using the media guide. No migration is needed for working legacy records. Do not automatically adopt/delete historical assets or run production mutation probes.

## Staged rollout and rollback

1. Preserve the current deployed rules/configuration and a known good **Admin + ledger-compatible** application build. Record the intended Firebase project and Cloudinary account without copying secrets into logs.
2. Run all local checks and require green GitHub CI. Use a separate Preview/staging project and provider account, with notifications disabled or directed to a test chat. Verify real Firestore transaction/index behavior, uploads, failures, and override/rate-limit defenses there.
3. Review production environment values, IAM, client rules, indexes, hosting upload limits, and legacy references. Coordinate retiring old writers, PIN rotation, and tightening rules. Do not enable production writes while permissive rules or alternate writable deployments remain.
4. After separate release approval, stage the production build without assigning public domains. Perform read-only smoke checks of both feeds, existing legacy images, navigation, and session response headers. Do not use production create/delete probes as a substitute for staging verification.
5. Promote only after gates are satisfied. Watch safe API error logs and incomplete ledger states. Recovery starts with dry-run and human review of a single asset; it is not part of rollout automation.
6. If errors appear, restrict mutation access first. Roll back only to an Admin/ledger-compatible build. **Do not restore a pre-ledger writer** against the new media state or reopen Firestore client rules. Keep ledger records and tombstones, preserve unknown/retired assets for review, and deploy a forward fix if no compatible rollback exists. Rotating the signing secret invalidates sessions but does not replace disabling an insecure old deployment.

## Release verdict

- **Ready to merge:** subject to successful final checks and normal PR review; no demonstrated unresolved application logic regression. Require the first hosted CI run before merging PR #1.
- **Ready to deploy:** **No.** External configuration remains unverified, including shared login throttling, staged adapter behavior, real Firestore behavior and hosting limits.
- **Requires additional work:** operational verification and staging rollout gates above. The coordinated dependency upgrade is complete. Monitor upstream residual advisories; repeatable browser/emulator CI remains future maintenance.

## Changed files

- `.github/workflows/ci.yml`, `package.json`, `bun.lock`, `.prettierignore`: reproducible secret-free validation, metadata, Telegraf removal, ignore generated hosting output during formatting.
- `src/lib/server/cloudinary.ts`, `src/modules/wishlist/utils/description.ts`, `src/styles/global.css`: remove confirmed unused helpers/re-export/styles and fix the pre-existing formatting issue.
- `src/components/WishListItem.astro`, `src/pages/api/items/fragment.astro`, `WishlistImageField.astro`, `WishlistItemActions.astro`: remove undefined animation hooks, the obsolete appended flag and unused image metadata attributes.
- `src/pages/index.astro`, `WishlistOwnerFeed.astro`, `WishlistItemActions.astro`, `WishlistFormAccess.astro`, `WishlistDescriptionField.astro`, `WishlistImageField.astro` under the wishlist components: accessible Add controls, Options focus, and accurate error regions without a redesign.
- `scripts/reconcile-images.ts`: invalid argument exit status. `tests/wishlist.media.test.ts`: competing attachment/cleanup orderings and duplicate recovery. `tests/wishlist.form.test.ts`: wait for actual unlock state instead of a fixed timing assumption.
- `README.md`, `SECURITY.md`, `docs/media-lifecycle.md`, this assessment: current architecture/tooling, corrected security assumptions, conservative legacy/recovery procedure, release and rollback gates.
