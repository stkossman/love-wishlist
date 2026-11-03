# Love Wishlist

A small shared wishlist for two people, built with Astro SSR, TypeScript, Tailwind CSS v4, Firebase Admin, and Cloudinary. Hosted on Vercel. Optional notifications use the Telegram HTTP API.

## Local development

Use Node.js 22.23.4+ and Bun 1.3.5 (the version pinned in CI).

```sh
bun install --frozen-lockfile
cp .env.example .env
# Configure a separate development Firebase project and Cloudinary account.
bun run dev
```

Server-only configuration:

| Variables                                                              | Purpose                                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SECRET_PIN`, `SESSION_SECRET`                                         | Fresh four-digit PIN; independent signing secret of at least 32 random bytes |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Dedicated Firebase Admin service account; PEM accepts literal `\n` escapes   |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image upload/deletion in the intended account                                |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                               | Optional; notifications are disabled unless both are set                     |

Server code reads configuration from runtime `process.env`; Bun loads `.env` for local commands. Never prefix credentials with `PUBLIC_`. Development and Preview must not use production credentials or media. See [.env.example](.env.example).

## Architecture

- `src/pages`: SSR pages and API routes. `/andrii` maps to owner `me`; `/juliette` maps to `her`. Routes authenticate mutations and validate request contracts.
- `src/lib/server`: signed sessions, same-origin checks, bounded request parsing, per-instance login throttling, lazy Firebase Admin, and Cloudinary SDK integration.
- `src/modules/wishlist`: validation, deterministic timestamp/document-ID cursors, item repository, media ledger, services, shared components, and browser controllers.
- Item transactions attach/retire managed images atomically in Firestore. The media service performs provider cleanup after commit. Telegram notifications are awaited, bounded, and best-effort.
- `scripts/reconcile-images.ts`: explicit dry-run inspection and per-ID recovery. There is no scheduled cleanup job.

Read pages, JSON, fragments, and edit-page data are public at the application level. A server-verified PIN creates an eight-hour signed HttpOnly session shared by both people. The PIN controls mutations, not read privacy. Admin SDK access bypasses Firestore Security Rules, so API authorization and restricted service-account IAM are essential.

## Validation and CI

```sh
bun run test
bun run typecheck
bun run check
bun run format:check
bun run build
git diff --check
```

`format:check` never rewrites source; `bun run format` is an explicit formatting command. GitHub Actions runs one validation job for pull requests and pushes to `main`, using Node 22.23.4, pinned Bun, the committed lockfile, and no integration secrets. Firebase and Cloudinary initialize lazily, so the SSR build needs no credentials. Tests mock persistence/providers and never require production access.

The Bun suite covers API/security contracts, cursor precision, repository behavior, browser-controller logic, and media failure/retry races. Controller tests use DOM substitutes; they are not a browser engine. Stage 5 also received isolated Chromium verification; that temporary harness is not a committed or CI browser suite. See [the readiness assessment](docs/production-readiness.md) for results and limits.

## Production and recovery

Read [SECURITY.md](SECURITY.md), [media lifecycle and operator recovery](docs/media-lifecycle.md), and [production readiness and rollout](docs/production-readiness.md) before enabling writes. Deployed rules, IAM, indexes, WAF, provider permissions, and environment isolation require manual verification. The upgraded adapter authenticates internal path overrides; distributed login throttling still needs external verification. See [dependency versions, migration and residual advisories](docs/dependency-update.md).

Legacy image records continue to work without migration. Untracked historical assets are retained; no automatic adoption or deletion is performed. Firestore and Cloudinary cannot commit atomically, so interrupted operations need conservative recovery.
