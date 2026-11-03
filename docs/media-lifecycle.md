# Media lifecycle

## Failure windows before Stage 4

The browser uploads first, saves an item second, and initiates image deletion itself.

- Navigation after upload can leave an unassociated asset.
- A failed item request does not prove that Firestore rejected the write. Browser cleanup after a lost response can delete the image of a successfully saved item.
- Replacement cleanup depends on the browser remaining alive after save and uses its stale copy of the previous public ID.
- The authenticated generic deletion endpoint accepts any matching wishlist public ID, including referenced assets.
- Item deletion commits before cleanup. Cleanup failure preserves the item deletion but has no durable recovery record.
- Reading an item, changing it, and deleting its former asset are separate operations. Concurrent changes can invalidate a cleanup decision.
- MIME declarations alone do not establish the uploaded file format, and upload responses are trusted without verifying their identity or metadata.

## Stage 4 design

An auxiliary `wishlistImages` collection records server-generated, non-overwriting uploads and their lifecycle. Existing `items` documents retain their schema. The ledger is necessary to atomically prevent attaching an asset after cleanup begins; a reference check alone cannot provide that protection.

### Ownership and ordering

Each upload reserves a server-generated `wishlist/<uuid>` public ID **before** contacting Cloudinary. Uploads use `overwrite: false`. The ledger stores version 1, intended Cloudinary account, public ID, state, creation/update timestamps, canonical upload metadata, and an attached item ID when applicable. It contains no credentials. State transitions are:

`uploading -> ready -> attached -> retired -> deleting -> deleted`

Old abandoned `uploading`/`ready` entries and interrupted `deleting` entries can also enter recovery after the grace period. Deleted entries remain as tombstones; do not remove them or restore their IDs for reuse.

Creating an image-bearing item atomically attaches its upload. Replacing/removing an image or deleting an item atomically changes the item and retires its previous **tracked** asset. The server awaits cleanup after that commit. A cleanup transaction verifies the configured Cloudinary account and checks references by public ID and canonical URL, then marks the asset `deleting`. Every application attachment reads the same ledger document and rejects retired/deleting/deleted assets. This closes the application check-then-delete race without a cross-provider transaction.

Image changes on PUT carry `X-Wishlist-Image-Version`, rendered into the edit form from the current image identity. Missing versions return 428; stale versions return 409. Unrelated-field updates need no image version. Successful image changes can be retried with the old version only when all supplied fields already match the saved state. New metadata comes from the registered upload rather than client assertions.

The browser retains an upload result while retrying the same selected `File`. A repeated create with that upload and identical saved fields returns the existing item ID. A conflicting reuse fails with 409. General exactly-once item creation is not promised: a reload loses the in-memory upload cache, and creates without images retain their previous request semantics. Telegram delivery is best-effort and is not deduplicated by the media ledger.

### Compatibility and deletion boundary

The item schema, owner values, routes, upload response shape, supported JPEG/PNG/WebP formats, 5 MiB limit, and nullable removal DTO remain unchanged. The auxiliary collection is the only new persistence schema. No migration or automatic adoption of old assets runs.

Legacy images without ledger records can be replaced, removed, or have their items deleted. Their Cloudinary assets are retained because a prefix alone does not establish ownership. Their URLs/public IDs need manual inventory and review before any future adoption or deletion. Older in-flight uploads are similarly untracked and cannot be newly attached; refresh/reselect the file.

`DELETE /api/images/delete` retains the Stage 1 session, origin, body-size, and input checks, but valid requests now return **410 Gone** without provider calls. It cannot delete a currently referenced image or any arbitrary shared-account asset. All application cleanup is internal to the media service.

### Validation and errors

Upload checks compare declared MIME with PNG/JPEG/WebP header structure and size. Header checks are not a complete decoder: Cloudinary still decodes the image, with an explicit format allowlist. Returned public ID, account URL, resource/delivery type, format, dimensions, and byte count are validated before the ledger becomes ready. Metadata mapping is shared between browser and server.

SDK timeouts are 10 seconds for upload and 3 seconds for deletion. Persistence errors propagate through existing API error responses. Upload outcomes that cannot be confirmed return a safe 502; the reservation remains for inspection. Item persistence success followed by cleanup failure still returns item success. Cleanup logs identify the asset and operation without dumping credentials or provider responses. Failed cleanup leaves a durable ledger record.

### Operator recovery

The tool uses configured server credentials and can affect the configured environment. No live reconciliation, provider scan, database write, or asset deletion was executed during implementation.

1. In an explicitly selected staging environment, inspect old records with `bun scripts/reconcile-images.ts --dry-run`. It only reads the application's Firestore ledger and reference queries, not a Cloudinary asset listing.
2. Review the output. Candidates must be at least **24 hours old**, with no ledger update in the last 24 hours. Entries marked `referenced: true` must be retained. The small-app inspector reads the complete ledger; paginate it if the application grows substantially.
3. After reviewing a specific candidate, apply **one explicit ID** with `bun scripts/reconcile-images.ts --apply --public-id wishlist/ID`. Applying rechecks age, state and references transactionally; a prior dry run does not authorize deleting an asset that has since been attached. Results are `deleted`, `retained`, or `failed`; failure sets a nonzero exit code.
4. Keep failed/deleting records and rerun inspection after the grace period. Provider `not found` is a successful idempotent cleanup outcome. A crash after provider deletion but before marking `deleted` is therefore recoverable.

There is no scheduled job or new infrastructure. Recovery is an explicit operator action. Keep ledger access server-only under the existing deny-all client rules and verify deployed rules/IAM before enabling writes. No new composite index is required by these equality reference checks.

### Cross-provider limits

Firestore and Cloudinary cannot commit atomically. A crash after item commit and before cleanup leaves a retired asset for recovery. A crash or response loss during upload leaves a reservation; a late provider completion beyond the recovery grace period could leave an unassociated asset even after an earlier `not found` result. The tool cannot discover historic/unregistered assets or guarantee complete orphan recovery.

The safety guarantee applies to writes through this application and its ledger. Direct database edits, permissive deployed client rules, other deployments running pre-ledger code, independent Cloudinary overwrites/deletes, or manual recreation of a retired public ID can bypass those invariants. Reference queries cover public IDs and the canonical URL written by this application, not arbitrary transformed URLs written outside it. Coordinate rollout and retire old writers; do not claim a universal cross-provider guarantee.

## Verification

Provider operations were mocked. Tests cover transaction rollback, lost commit responses, idempotent image retries, stale/concurrent replacements, referenced-image retention, provider failures, upload validation, and dry-run/grace-period safety. Browser tests use an in-memory Firestore substitute and mocked Cloudinary with the actual Astro routes, services, and repositories.
