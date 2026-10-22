# Runtime assets

Extracted game payloads are not source code. Character models, texture packs,
motions, native activity binaries, extracted graphics, sound effects, and music
are stored in R2, not in the current Git tree. The two project-created account
logos, runtime code, and structured JSON manifests remain in the repository.
This separation does not change ownership or grant redistribution rights.

AI-reconstructed inventory UI icons are a separate, repository-tracked asset
set: `play/ui/assets/inventory/` contains the 256px transparent lossless WebP
images imported by the inventory component. Vite emits versioned URLs for
these; they do not require R2 publication. `artwork/inventory/catalog.json`
records their provenance and distinguishes displayed items from unused/demo
artwork. Full-resolution reserve images in `artwork/inventory/reserve/` are
not imported or copied into the production build. The inventory currently
displays the character's saved possessions, including readable Story move scrolls.

`src/runtime-assets.generated.json` maps repository-relative source paths to
SHA-256 hashes and byte sizes. `src/RuntimeAssets.js` resolves these to
`shenmue/runtime/<sha256>/<source-path>` under `VITE_ASSET_URL`. Each build pins
its own content versions. Publishing never overwrites a different version or
deletes old R2 objects. The existing S1/S2 world-library and dialogue-voice
publication paths remain separate.

## Development

Hosted development and builds do not require extracted runtime files. Asset
groups come from the manifest, not filesystem globs. Vite does not include
restored audio/music binaries in production output.

For extraction-dependent tests or local asset editing:

```sh
npm run assets:restore
npm run assets:verify-local
npm test
```

Restore downloads only absent files, checks SHA-256, and refuses to overwrite
different local content. `VITE_OFFLINE_ASSETS=true` selects the original local
paths instead. This flag does not provide the separate world library; extract
those models as described in the tools guide. New extraction output remains
ignored until explicitly registered in the runtime manifest.

Archived worktrees do not retain ignored game data or tool caches. Restore
published assets with the command above; unpublished Story packages must be
rebuilt with the producer named by their `manifest.json` (`generatedBy`).
Reconnect the original extracted discs and world models first. Story audio
builders use `VGMSTREAM_CLI`, `DTPK_DUMP`, and a Python 3.12 `DTPK_PYTHON`
(DTPKDump imports `aifc`, removed from later Python versions). The ride-home
music builder also needs the original Disc 3 GDI and its audio track, through
`SHENMUE_DISC3_GDI`. Run `assets:verify-local` after recovery; the presence of
the tracked JSON manifests alone does not prove their binary dependencies exist.
The separate S1 world library must also satisfy `public/models.json` and
`public/texture-packs.json`. Mode, season and time changes can load additional
variants; a successful opening does not verify those files. `assets:verify-local`
checks the versioned runtime manifest, not these world catalogs.

Local `/play/` also uses available [prepared scenery](tooling/scenery-bundle-lab.md)
by default, including Shenmue II zones from all four discs. Build with
`npm run build:scenery -- --all` while Vite is running, or `--shenmue2` for only
Shenmue II. Output stays Git-ignored under `.disc-work/scenery-bundle/` and is not
included in production builds or published by this command. Worlds without a
local bundle use original assets. `?scenery=original` is a comparison switch.

Production uses `play/data/scenery-bundles.generated.json` to pin the exact
manifest and binary for each published world. R2 keys use
`shenmue/scenery/<decoded-sha256>/<world>/world.json` or `world.bin`. Payloads
are gzip-compressed for transfer; browser decoding restores the original bytes,
whose size and hash the loader verifies. These keys never require a mutable
"latest" catalog or deployment-time model conversion. Unsupported worlds retain
the ordinary loader; a missing or corrupt registered payload is an error.

After rebuilding scenery, register and publish it before deploying:

```sh
node tools/assets/scenery-publication.mjs register
node tools/assets/scenery-publication.mjs check
npm run upload:assets -- --game scenery --dry-run
npm run upload:assets -- --game scenery --worker-url http://127.0.0.1:8799 --concurrency 4
```

Registration requires all supported bundles, verifies binary checksums and
current world/placement contracts, and pins the audited ownership-input hashes.
The separate `check` command also works in a clean clone without extracted
payloads; deployment CI runs it. Compressed publication copies remain ignored
under `.disc-work/scenery-publication/`. Uploads verify compressed storage bytes;
the runtime verifies decoded bytes. Preserve all scenery keys used by current,
rollback and already-open clients. The existing runtime-only retention audit
does not cover this separate namespace; this workflow has no deletion operation.

The full research test suite also reads disc extracts, world models and generated
capture evidence outside this manifest. Restore alone does not supply those
inputs; a fresh checkout can build without them, but cannot run every native
conformance test. See the README for asset-independent release checks.

## Updating and publishing

1. Run the appropriate extractor to produce the desired source files.
2. Update the relevant manifest records explicitly:

   ```sh
   npm run assets:update -- play/assets/characters/FUK_M.CHRM
   ```

   With no paths, the command rehashes every registered source file and fails
   if any are absent. JSON used by URL-based activity loading also has a versioned
   copy; regenerate its record when changing that JSON.
3. Publish and verify **before** deploying a client referencing the new hashes:

   ```sh
   npm run upload:assets -- --game runtime --dry-run
   npm run upload:assets -- --game runtime --concurrency 4
   ```

   This uses the existing `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_ENDPOINT`, and `R2_BUCKET_NAME` configuration. Alternatively, use the
   existing loopback-only authenticated Wrangler bridge:

   ```sh
   npx wrangler dev --config tools/r2-asset-upload-worker/wrangler.jsonc --ip 127.0.0.1 --port 8799
   npm run upload:assets -- --game runtime --worker-url http://127.0.0.1:8799 --concurrency 4
   ```

   Do not expose this local publishing bridge to the network. It uses Wrangler's
   authenticated remote R2 binding; it is not a production service.
4. Run focused tests and `npm run build`, review/commit the source and manifest
   changes, then follow `DEPLOYMENT.md` for a separately authorized deployment.

The upload planner verifies every local source hash before writing anything.
Uploads preserve MIME types, validate checksums, and verify remote metadata.
Existing identical objects are skipped. Partial failures are retryable with the
same command; a failed publication must not be followed by client deployment.
For a large new collection, `--source-prefix public/music/shenmue2` limits runtime
validation/publication to that repository-relative directory; unrelated local
payloads need not be restored. Bridge request timeouts can be configured with
`--request-timeout-ms` (default 120000); retries retain the same key and checksum.
For a small approved change spanning directories, repeat `--source-path <file>`
to validate and publish only those exact registered files. Unknown paths fail;
unrelated local changes are not included. Include changed versioned JSON
metadata as well as its binary dependencies.

## Existing clients and Git history

### R2 reference audit

`npm run assets:r2:audit-retention` inventories only the content-addressed
`shenmue/runtime/` prefix. It protects the local working manifest (including
pending changes) and any explicitly supplied deployed/rollback Git manifests.
Provide the existing `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and optionally
`R2_ENDPOINT` through the environment. It never writes to R2 and has no deletion
mode. Reports list missing objects, wrong sizes, unknown keys, and objects absent
from the supplied manifests; absence alone is not deletion authorization.

Verify the successful deployments and actual live/rollback builds first, then
supply their full commit IDs. For the 2026-10-01 audit:

```sh
npm run assets:r2:audit-retention -- \
  --retained-commit=ec948a8843d54cc551348c78041d2e431cd6dcc4 \
  --retained-commit=baf0ef5f2f9b6497817c0515fe7d362a6e59ae06 \
  --report=/var/tmp/new-yokosuka-r2-retention.json
```

The older June 19 rollback predates versioned runtime assets and uses same-origin
files, so it has no runtime R2 manifest. Failed/missing requested manifests stop
the audit. Keep every object used by any retained build or pending manifest.
Any future cleanup must also retain unreferenced objects for at least 30 days
and recheck publication/deployment state before deleting. Do not apply an
age-only R2 lifecycle rule: an old content hash can still serve a new client.

World-model libraries, dialogue voices, movies/HLS, and arcade assets use
separate catalogs and stay outside this audit. They require their own reference
inventory before any cleanup. There is no scheduled or automatic deletion.

The release script retains the previous two builds' `assets`, `audio`, and
`music` files using build-native inventories. This keeps pre-migration clients'
same-origin URLs available for the existing bounded retention period. New
clients use immutable R2 URLs.

Removing a payload from today's Git tree does **not** remove its historical
commits. History review/sanitization is a separate operation and must happen
before making a development history public if those old payloads must be absent.
