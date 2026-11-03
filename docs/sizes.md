# Editable measurements

`/sizes` preserves the two-person guide, labels, units, and reference values in
`src/data/sizes.ts`. Each person has an inline editor using the existing PIN dialog
and eight-hour signed session. Save sends only changed values; Cancel restores
the last saved values. Failed saves keep edits available for retry, including when
the session expires. A failed initial read shows clearly labelled reference values
and disables that person's editor until reload succeeds.

## Firestore and API

- `sizes/andrii` and `sizes/juliette` are separate documents. Each holds a `values`
  map keyed by `height`, `chest`, `waist`, `hips`, `shoulders`, `sleeve`, `insole`,
  and `ringSize`, plus an Admin `updatedAt` server timestamp.
- Values are strings, preserving decimals and ranges (`17.5-18`, `172-174`).
  Inputs accept positive numbers or ascending ranges up to 300, at most 20
  characters. Labels, units, person IDs, and unknown fields cannot be changed.
- `GET /api/sizes/:person` returns `{ measurements: Measurement[] }`, with default
  values for missing fields. Reads never create documents or backfill fields.
- `PATCH /api/sizes/:person` accepts a nonempty partial map, e.g.
  `{ "ringSize": "17.5-18" }`, and returns `{ message: "Measurements saved" }`.
  The existing authorization and same-origin wrapper protects every write. JSON
  bodies are limited to 2 KiB. Unsupported people return 404.
- A transaction merges changed fields into the selected document, preserving
  untouched measurements and unknown stored fields. Concurrent writes to separate
  fields merge; concurrent writes to the same measurement use the last successful
  write. The shared PIN authorizes editing either person.
- Page and successful API reads use `Cache-Control: no-store`. The old static
  update date is removed; the page does not display a date.

Measurements remain **publicly readable** through the page and GET API unless
hosting-level restrictions apply. The PIN protects mutations, not read privacy.
Firebase Admin bypasses Firestore Security Rules; browser Firestore access remains
denied by the existing rules.

## Deployment and verification

No migration, index, dependency, or new environment variable is required. Keep
the existing Firebase Admin credentials, `SECRET_PIN`, and `SESSION_SECRET` in
the deployment environment. The service account needs read/create/update access
to `sizes` documents. Missing documents are normal and are created only on an
authorized save. Use an isolated development/Preview Firebase project for QA.
No production data should be seeded or changed as part of rollout.

`tests/sizes.test.ts` covers default/stored reads, validation, authenticated and
rejected API writes, independent transactional updates, fresh reads after saving,
and persistence failures. `tests/sizes.editor.test.ts` covers inline Save/Cancel,
loading, validation, duplicate saves, session expiry, network errors, retry, and
independent edits. These tests use the existing in-memory Firestore helper and
DOM substitutes. Browser QA uses an isolated local persistence substitute; real
Firestore IAM and deployed hosting restrictions require environment verification.
