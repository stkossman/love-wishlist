# Stage 1 security configuration

## Authorization and endpoint inventory

The application still exposes read pages, measurements, item JSON, and item HTML fragments without application authentication. Existing hosting protection, if any, is separate. Do not treat the PIN overlay as read protection: edit-page data is rendered before authorization.

`POST /api/auth/session` verifies a four-digit `SECRET_PIN` on the server and sets an eight-hour, host-only `wishlist_session` cookie. The cookie is HMAC-signed, HttpOnly, SameSite=Strict, and Secure in production. It has no user identity: both people share mutation access. Rotating either the PIN or signing secret invalidates outstanding sessions. There is no individual session revocation store.

`GET /api/auth/session` reports session validity without returning the token. Authentication responses are not cached. The existing add/edit PIN interface verifies with the server and accepts an existing session. Deleting without a session opens a password-input dialog.

All five existing mutation endpoints use the same signature/expiry and same-origin guard, before parsing bodies or calling integrations:

| Method | Route                |
| ------ | -------------------- |
| POST   | `/api/items`         |
| PUT    | `/api/items/:id`     |
| DELETE | `/api/items/:id`     |
| POST   | `/api/images/upload` |
| DELETE | `/api/images/delete` |

Both login and mutation requests require an `Origin` header exactly matching the request URL origin. Cross-site Fetch Metadata is rejected. Browser same-origin requests provide this automatically; trusted command-line callers must explicitly provide the correct Origin and an authenticated cookie. Supplying the retired `x-auth-pin` header does not authorize a request. No cross-origin CORS access is enabled.

## Environment and runtime

Use Node.js 22 or newer in Vercel project settings (Firebase Admin 14 requires Node 22+). Use Bun for package management and tests. Copy `.env.example` to an ignored local environment file and configure each Vercel environment separately.

- `SECRET_PIN`: a **new** four-digit numeric PIN, including leading zeroes if desired. Never reuse the value previously shipped to browsers.
- `SESSION_SECRET`: independently generated cryptographic secret, at least 32 random bytes. For example, generate one locally with `bun -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`; store the output privately.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: credentials for a dedicated service account in the intended project. The private key is PEM text; literal `\n` escapes are accepted. Grant only the Firestore data access needed by this app (for example, Cloud Datastore User), not project Owner/Editor.
- Keep the existing private Cloudinary settings. Telegram variables remain optional.

Remove `PUBLIC_SECRET_PIN` from local and Vercel configuration. Remove unused `PUBLIC_FIREBASE_*` settings after confirming no other application needs them. Public Firebase configuration was not itself a privileged credential.

Production and Preview must use separate signing secrets, PINs, and database credentials/projects. Mark credentials and secrets as private/sensitive in Vercel; never use a `PUBLIC_` prefix. Configure secrets in runtime environment settings, not committed files. Rebuild/redeploy only after explicit deployment approval. Old deployments/assets contained the old public PIN, so changing only the source is insufficient: rotate the PIN and retire old writable deployments. Missing auth configuration fails closed with 503. Firebase initializes lazily and has no browser-SDK fallback.

## PIN guessing protection — deployment prerequisite

The application limits login attempts to five per client address per fifteen-minute window **per running instance**. The table is bounded and expired entries are removed. It uses the adapter-provided client address, not a header supplied directly by application callers.

This is a local backstop, not distributed protection. Vercel cold starts and multiple instances have separate counters. Before enabling production writes, configure a shared Vercel WAF rate-limit rule:

1. Open the intended Vercel project's Firewall and create a rate-limit rule matching **POST** and exact pathname **`/api/auth/session`**.
2. Group requests by client IP and block excessive attempts, targeting at most five requests per fifteen minutes. If the plan supports a different interval, choose an equally restrictive available policy; inspect the project's actual plan capabilities.
3. Apply it to every publicly reachable writable deployment/domain, including Preview deployments if enabled. Confirm an exceeded limit returns a blocked response and normal login remains usable.
4. Confirm the deployed adapter resolves the original client IP and request origin correctly. Never weaken origin checks to accommodate a proxy without establishing its trusted forwarding configuration.

A four-digit shared PIN has low entropy. Per-IP limiting does not prevent a distributed attack. If exposure or threat level increases, revisit the PIN interaction and shared durable throttling before expanding access. No WAF settings were changed by this implementation.

## Firestore trust boundary and production rules

All application reads/writes now use `firebase-admin` from server modules with a service account. Admin access uses IAM and bypasses Firestore client security rules; the application mutation guard is therefore mandatory. The `items` collection, owner values, existing fields, server timestamps, and image-field deletion semantics are preserved. Existing query/index requirements are unchanged.

The repository previously contained no rules. **Deployed rules, IAM permissions, indexes, and service-account credentials were not inspected or changed.** The checked-in `firestore.rules` is a proposed deny-all policy for direct client access; it is not evidence of the deployed policy. Public application reads still work through the Admin SDK under this policy.

Manual verification and deployment steps, after explicit approval:

1. Confirm `FIREBASE_PROJECT_ID` identifies the intended project. Open Firebase Console → Firestore Database → Rules; save a copy of the currently deployed rules and review any other applications using the database.
2. Use the Rules Playground to simulate an unauthenticated **create**, **update**, and **delete** at `/items/security-check`. Each must be denied. This simulator does not modify production data. Repeat for authenticated client contexts if any existing rule grants them writes.
3. Review every matching rule: Firestore grants access if **any** matching allow condition succeeds. Adding a deny block beside an existing permissive block does not revoke that permission.
4. If this database is dedicated to this server-only application, review the complete local `firestore.rules` as the proposed replacement. If other clients use it, prepare a combined policy that denies direct mutations to `items` without breaking their legitimate access.
5. Stage the service-account migration and proposed rules in a separate Firebase project. Verify the application can read, create, update, remove images, and delete there; verify anonymous direct mutations remain denied. Confirm required owner/createdAt indexes already exist.
6. Only after approval, publish the reviewed policy through the Firebase Console Rules editor. Repeat the simulator checks. Coordinate the Admin deployment and rule tightening so the old web-SDK server is not left unable to operate.

Do not run production write probes, rule deployment, migrations, or data cleanup as part of local tests. If currently deployed rules permit anonymous writes, direct mutation exposure remains until the approved rule change is published.

## Validation and compatibility

Create/update bodies are JSON objects with explicit field allowlists. Unknown fields, including `id` and `createdAt`, are rejected. Owner must be `me` or `her`. Required names/topics are trimmed and non-empty; optional text is trimmed. Limits: topic 200, name 300, price 100, URL 2048, description 1024 characters; at most 50 specs, with labels up to 100 and values up to 500 characters. These are acceptance bounds for new writes, not a migration of existing records.

Reference URLs are empty or absolute HTTP(S) URLs. Specs must contain only non-empty string `label`/`value` pairs. Existing form payloads remain supported, including empty optional fields and `description: null` normalized to an empty string. Updates may omit unchanged fields but cannot be empty.

New image payloads require a matching HTTPS Cloudinary URL and `wishlist/` public ID in the configured account; optional dimensions/format/bytes must be valid. Image removal on update accepts null URL and public ID, with any supplied metadata also null; the server clears all six image fields. Mixed null/replacement metadata is rejected. New attachments also require a server-registered upload in the media ledger; matching a prefix alone does not establish ownership. The server uses the registered metadata. Image changes carry the edit form's image version, while untracked legacy assets are retained for manual review.

JSON bodies are bounded at 64 KiB (login and image deletion at 1 KiB). Multipart uploads are bounded before parsing, allow one non-empty JPEG/PNG/WebP file up to 5 MiB, compare content headers with the declared MIME type, and rely on Cloudinary to fully decode the image. Status codes: 400 invalid input, 401 invalid/missing/expired session or credentials, 403 origin failure, 409 stale/conflicting image state, 410 retired direct image deletion, 413 oversized body, 415 unsupported content type, 428 missing image version, 429 throttled login, 502 unconfirmed upload, 503 unavailable configuration, and safe generic 500 for unexpected failures.

## Verification and deferred work

Run `bun run test`, `bun run typecheck`, `bun run check`, and `bun run build`. Tests stub persistence and external providers; they never exercise production services. A successful build does not verify deployed rules, IAM, WAF, credentials, or an external provider.

Stage 2 remains deferred: timestamp cursor precision, full legacy-document decoding, media cleanup across navigation/partial commits, background notification completion, and broader frontend refactoring. Read privacy remains an explicit product decision. No production settings, data, deployments, or credentials were changed here.

## Stage 4 media lifecycle

Read [the media lifecycle and recovery guide](docs/media-lifecycle.md) before operating media cleanup. `wishlistImages` is a server-only auxiliary ownership ledger; the existing deny-all client rules cover it, but deployed rules and IAM must still be verified. Existing `items` documents require no migration.

The generic image delete route is retired: authorized, valid requests return 410 without touching Cloudinary. Newly attached images must be registered uploads, and image-changing PUTs require `X-Wishlist-Image-Version` (428 if missing, 409 if stale). Item fields and nullable removal semantics remain compatible. MIME/header checks and validated provider metadata supplement Cloudinary decoding. Do not use old client code or uncoordinated direct writes with the new ledger.

Cleanup after item persistence is internal, awaited, and failure-isolated. Recovery defaults to dry-run inspection with a 24-hour grace period and requires an explicit public ID for application. Neither production reconciliation nor provider inventory was run during implementation. Historic untracked assets are retained for manual review.
