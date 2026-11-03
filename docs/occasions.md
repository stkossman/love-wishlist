# For occasions — Phase 2

Occasions belong to existing `items` documents. There is no new collection or migration. An optional `occasion` map contains `type`, integer `year` (1900–9999), and integer `desire` (1–5). Supported types are `new-year`, `birthday`, `christmas`, `valentines-day`, `anniversary`, and `other`. Only `other` accepts and requires `customLabel`, trimmed to 1–80 characters.

Create requests omit the map when unused. Updates omit it to preserve the association, supply a complete map to replace it, or use `occasion: null` to remove it. Both ordinary updates and transactional image updates translate null into Firestore field deletion. Removing the association keeps the wish and its image. Stored documents without an occasion remain readable and appear in All; invalid stored occasion maps are ignored in display serialization.

## Routes and browsing

- `/occasions`: both owners.
- `/andrii/occasions`: Andrii (`me`), with the existing dark/red theme.
- `/juliette/occasions`: Juliette (`her`), with the existing green/pink theme.
- Optional `?occasion=birthday&year=2027` filters either or both fields. Blank controls mean every occasion / any year. Clear filters returns to the current occasions route.

Owner links retain the collection type and reset filters. All returns to the corresponding existing feed. The identity link returns to the combined All feed. The existing browser Grid/List preference applies to initial cards and loaded fragments. The shared add/edit form uses native radio inputs for five-heart selection, including arrow-key navigation; selecting No occasion removes the association on save. Cards and details show the name, year, and compact heart level. Other labels are escaped by Astro and are browsed together under Other.

## Queries, pagination, and indexes

JSON `/api/items` and HTML `/api/items/fragment` accept `collection=occasions`, `occasion`, `year`, existing `owner=me|her`, and `cursor`. Supplying occasion or year also selects the occasions collection. Malformed occasion/year/collection parameters return 400 before querying.

Filtering happens in Firestore before the six-document limit: selected types use equality on `occasion.type`; every occasion uses `in` with the six allowed types. Year adds equality on `occasion.year`; owner adds equality on `owner`. This avoids an inequality/existence query that would interfere with the established `createdAt DESC, __name__ DESC` order. Old documents are excluded from occasions without backfilling any fields.

Cursors retain timestamp seconds and nanoseconds and the document ID. Their canonical encoding binds owner, collection type, occasion type, and year. Mismatches, malformed tokens, and unfiltered cursors used for filtered feeds return 400. Existing All-feed cursors remain compatible. Pagination retains the existing behavior of returning a cursor for a full six-item page; a final empty request may be needed. Edits while browsing are not a snapshot: refresh after changing an item's occasion.

[firestore.indexes.json](../firestore.indexes.json) defines four additional collection-scope composite indexes for `items`:

| Equality fields (ascending)               | Ordered fields (descending) |
| ----------------------------------------- | --------------------------- |
| `occasion.type`                           | `createdAt`, `__name__`     |
| `occasion.type`, `occasion.year`          | `createdAt`, `__name__`     |
| `owner`, `occasion.type`                  | `createdAt`, `__name__`     |
| `owner`, `occasion.type`, `occasion.year` | `createdAt`, `__name__`     |

Equality and `in` filters can use ascending index fields; the descending document-ID suffix matches the explicit tie-breaker. See [Firestore index documentation](https://firebase.google.com/docs/firestore/query-data/index-overview).

Before rollout, add these indexes in the intended Firebase project's console, or merge them into that project's existing index configuration. Preserve all existing indexes, including the All-feed owner/createdAt index and media indexes. This file is additive documentation, not a complete inventory of deployed indexes. Wait for indexes to finish building and validate query combinations in an isolated Firebase project before releasing application code. No new environment variables, provider setup, or data migration are required. No indexes or application changes were deployed during implementation.

## Verification and limits

Final verification: `bun test` passes 156 tests across nine files (785 assertions); `bun run typecheck` passes; `bun run check` reports zero errors, warnings, or hints; `bun run build` passes; changed-file Prettier checks and `git diff --check` pass. The initial sandboxed build could not replace an existing generated `.vercel/output/config.json`; the approved build outside that sandbox completed successfully.

The Bun tests cover occasion values and boundaries, serialization, old documents, create/edit/removal, ordinary and image-transaction paths and retries, owner/type/year filtering before pagination, timestamp ties, malformed/mismatched cursors, API authorization, and dynamic fragment filter propagation. Existing media, form recovery, and Grid/List tests continue to apply.

Chromium checks use a temporary Vite persistence alias with the test in-memory Firestore and synthetic wishes. Firebase, Cloudinary, and Telegram credentials are disabled. Desktop 1440×1000 and mobile 390×844 cover combined and owner routes, filtering, six-card pagination, both owner themes, PIN unlock, Other creation, edit hydration, changes/removal while keeping the wish, keyboard heart selection, empty states, and saved List rendering for dynamically loaded cards. The Browser plugin is unavailable, so the Playwright MCP is used. The temporary harness and screenshots are outside tracked source.

These checks do not verify deployed IAM/rules/indexes, real Firestore index selection, Cloudinary provider calls, or browser engines other than Chromium. No production data is used or changed.
