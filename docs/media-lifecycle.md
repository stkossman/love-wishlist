# Cloudinary recovery

## What the app guarantees

Uploads reserve a new `wishlist/<uuid>` ID in Firestore's `wishlistImages` ledger
before contacting Cloudinary, with `overwrite: false`. The ledger records the
Cloudinary account, metadata, item attachment, and timestamps. Normal states are:

`uploading -> ready -> attached -> retired -> deleting -> deleted`

Item creation/changes and ledger attachment/retirement commit together in
Firestore. Cloudinary deletion happens afterward, only after an account/state
check and reference queries on public ID and canonical URL. Attachments reject
retired/deleting/deleted records. Keep deleted records as tombstones; do not
TTL-delete them or reuse their public IDs.

Legacy images without ledger records still display and can be removed/replaced
on items, but their Cloudinary assets are retained. No migration or automatic
adoption/deletion runs. A `wishlist/` prefix or managed tag alone does not prove
ownership. `DELETE /api/images/delete` is retired and returns 410 after validation;
cleanup happens internally or through the operator tool below.

## Failed requests and retries

- Image-changing item PUTs require `X-Wishlist-Image-Version`: 428 means missing,
  409 means stale/conflicting. Refresh the form before making a new image change.
  A retry with the old version succeeds only if all supplied fields already match
  the saved state. Unrelated-field updates need no image version.
- While the same file remains selected, the browser caches its upload for save
  retries. Creating with that upload and identical fields returns the existing
  item ID; conflicting reuse returns 409. Reloading loses the cache. Creates
  without images are not deduplicated.
- Uploads time out after 10 seconds; unconfirmed outcomes return 502 and retain
  their reservation. A retry may allocate another ID. Inspect old reservations
  rather than assuming no provider asset exists.
- Deletion times out after three seconds. Item success is still returned if later
  cleanup fails; the ledger retains the pending work. Look for
  `Wishlist image upload incomplete` or `Wishlist image cleanup deferred` in server
  logs. Do not publish inventories or credentials when troubleshooting.

## Operator recovery

The tool uses the configured Firebase and Cloudinary environment. Identify the
intended project/account first; start in isolated staging. There is no scheduled
cleanup job. Verify [deployment/security precautions](../SECURITY.md) and stop if
older deployments or other writers can bypass the ledger.

```sh
# Read-only inspection of the Firestore ledger and item references.
bun scripts/reconcile-images.ts --dry-run

# After reviewing one candidate, apply only its explicit ID.
bun scripts/reconcile-images.ts --apply --public-id wishlist/ID
```

1. Review the dry-run output against a read-only Firestore view/export and
   Cloudinary inventory. It does not list Cloudinary assets or discover untracked
   legacy files. Check account ownership, public IDs, canonical URLs, and URL-only
   item references. For uncertain uploads, inspect the provider inventory too.
2. A recovery candidate must have both creation and last update at least **24 hours
   old**. `attached` and `deleted` records are excluded. Retain anything marked
   `referenced: true`. The inspector reads the full ledger; paginate it if needed
   as the project grows.
3. Apply only a reviewed ID. The tool rechecks account, age, state, and references
   transactionally; a dry run is not a guarantee that the asset is still unused.
   Results are `deleted`, `retained`, or `failed`; failure exits nonzero.
4. Keep failed/deleting records and inspect again after the grace period.
   Cloudinary `not found` counts as successful cleanup, so a crash after provider
   deletion but before marking the ledger `deleted` can be retried safely.

If ownership is unclear, references cannot be checked, the configured account has
changed, or the ledger schema is unexpected, retain the asset and investigate.
Never force an `attached` record into cleanup because its item appears missing;
never edit states, erase tombstones, or recreate IDs to force a retry. Untracked
legacy assets need a separately reviewed ownership/reference check before any
manual deletion; they are not candidates for this tool.

Firestore and Cloudinary cannot commit atomically. An interrupted save may leave
a retired asset; a very late upload can leave an unassociated asset even after a
prior `not found` result. Recovery cannot guarantee discovery of all orphans.
Reference checks cover canonical URLs written by this app, not arbitrary
transformed URLs from other writers. Direct database/provider edits, permissive
client rules, or pre-ledger deployments can bypass these safeguards. If rollback
is necessary, preserve the ledger and use an Admin/ledger-compatible build.
