# Love Wishlist

A shared wishlist for Andrii and Juliette, built with Astro SSR, TypeScript,
Tailwind CSS v4, Firebase Admin, and Cloudinary. Hosted on Vercel; Telegram
notifications are optional.

## Development

Use Node.js 22.23.4+ and Bun 1.3.5, as pinned in CI.

```sh
bun install --frozen-lockfile
cp .env.example .env
# Configure a separate development Firebase project and Cloudinary account.
bun run dev
```

Server-only configuration (see [.env.example](.env.example)):

| Variables                                                              | Purpose                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `SECRET_PIN`, `SESSION_SECRET`                                         | Four-digit PIN; independent signing secret of at least 32 random bytes |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin service account; PEM accepts literal `\n` escapes       |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image upload/deletion in the intended account                          |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                               | Optional; notifications are disabled unless both are set               |

Bun loads `.env` for local commands and tests. Server code reads runtime
`process.env`, with an Astro `.env` fallback only in development. Configure Vercel
variables for each environment; rebuild/redeploy after changing them. Never use a
`PUBLIC_` prefix for secrets. See [Security](SECURITY.md) for access boundaries.

## Features and storage

- `/` combines both wishlists; `/andrii` uses owner `me`, `/juliette` uses `her`.
  `/settings` saves Grid/List display preferences in the current browser.
- `/occasions`, `/andrii/occasions`, and `/juliette/occasions` accept optional
  `?occasion=birthday&year=2027` filters. An optional `items.occasion` map holds
  `type`, integer `year` (1900–9999), and `desire` (1–5). Types are `new-year`,
  `birthday`, `christmas`, `valentines-day`, `anniversary`, and `other`; only `other`
  requires a `customLabel` (1–80 characters). Updates omit the map to preserve it,
  replace it with a complete map, or send `occasion: null` to remove it. Existing
  items without occasions stay in All; no migration is needed.
- `/api/items` and `/api/items/fragment` accept `owner=me|her`,
  `collection=occasions`, `occasion`, `year`, and `cursor`. Filtering precedes the
  six-item limit. Cursors bind all filters and retain timestamp/document-ID
  ordering; a full final page may require one extra empty request. Refresh after
  changing an item's occasion or receiving an outdated-cursor error.
- `/sizes` edits values independently in `sizes/andrii` and `sizes/juliette`.
  Documents hold a `values` map and server `updatedAt` timestamp. Missing fields
  use [the reference values](src/data/sizes.ts) without writing them. Public
  `GET /api/sizes/:person` returns `{ measurements }`; protected `PATCH` accepts
  changed keys, e.g. `{ "ringSize": "17.5-18" }` (2 KiB body limit). Values are
  positive numbers or ascending ranges up to 300, at most 20 characters. Labels
  and units are fixed. Transactions preserve untouched values and the other
  person; concurrent changes to the same value use the last successful write.
  Failed saves retain edits. Failed reads show reference values and disable
  editing until reload succeeds. No migration or size index is needed.
- Managed uploads are tracked in `wishlistImages`. Item changes commit before
  Cloudinary cleanup; legacy untracked assets are retained. Use the
  [media recovery guide](docs/media-lifecycle.md) for incomplete uploads or cleanup.

## Firestore configuration

Keep [firestore.rules](firestore.rules) and
[firestore.indexes.json](firestore.indexes.json) in version control. The rules deny
all direct client access; server Admin access uses IAM and bypasses these rules.
Checked-in files do not establish what is deployed.

The index file defines four occasion composite indexes for `items`:

| Equality fields (ascending)               | Ordered fields (descending) |
| ----------------------------------------- | --------------------------- |
| `occasion.type`                           | `createdAt`, `__name__`     |
| `occasion.type`, `occasion.year`          | `createdAt`, `__name__`     |
| `owner`, `occasion.type`                  | `createdAt`, `__name__`     |
| `owner`, `occasion.type`, `occasion.year` | `createdAt`, `__name__`     |

Add these in the intended Firebase project or merge them into its existing index
configuration. **Preserve existing indexes**: this file is not a full inventory.
The All owner feeds also need `owner ASC, createdAt DESC, __name__ DESC`. Retain
normal single-field indexes for unfiltered feeds and media reference checks on
`imagePublicId` and `imageUrl`. Media reference checks need no new composite index.
Wait until indexes are ready, then test owner/type/year combinations and pagination
in staging. A missing-index error includes a link to the required definition.

## Checks

```sh
bun run test
bun run typecheck
bun run check
bun run format:check
bun run build
git diff --check
```

CI runs these checks with a frozen lockfile. Tests substitute Firestore/providers;
browser-controller tests use DOM substitutes. Builds initialize integrations
lazily and need no credentials. Passing checks do not verify deployed IAM, rules,
indexes, WAF, or provider behavior. On Windows, existing CRLF checkouts may fail
strict formatting; `bun run format:check --end-of-line auto` checks without rewriting
line endings. Avoid unrelated formatting changes.

## Deployment and troubleshooting

1. Use the supported Node runtime, `bun install --frozen-lockfile`, and
   `bun run build`. Keep Production and Preview PINs, signing secrets, Firebase
   projects, Cloudinary accounts, and notification destinations separate.
2. Verify runtime secrets, least-privilege IAM for `items`, `wishlistImages`, and
   `sizes`, deployed client rules, and indexes. Follow the login WAF precautions in
   [Security](SECURITY.md). Keep ledger tombstones and never reuse managed image IDs.
3. Smoke-test real Firestore queries/transactions, PIN login, independent size edits,
   and image upload/replacement/removal/deletion in an isolated Preview environment.
   Verify origin/client-IP handling and Secure cookies on HTTPS. The app accepts
   JPEG/PNG/WebP files up to 5 MiB, but hosting may impose a lower multipart limit;
   check that limit before promising the full size.
4. Preserve deployed configuration and an Admin/ledger-compatible rollback build.
   Retire older writable deployments before rollout. After an approved release,
   check production reads and safe error logs; use staging for write probes. If
   rollback is needed, restrict mutations first and use a compatible build. Never
   restore pre-ledger writers or reopen client rules to work around an error.

For a 503, check server auth/image configuration. For a 401, sign in again; for a
403, verify the request origin/proxy setup rather than weakening checks. For an
image conflict (409/428), refresh the edit form before retrying. An unconfirmed
upload (502) or deferred cleanup needs the [media recovery guide](docs/media-lifecycle.md).
Telegram is best-effort, times out after three seconds, and may duplicate messages
on retried creates; it does not determine whether an item was saved.
