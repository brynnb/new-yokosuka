# Runtime assets

Extracted game payloads are not source code. Character models, texture packs,
motions, native activity binaries, extracted graphics, sound effects, and music
are stored in R2, not in the current Git tree. The two project-created account
logos, runtime code, and structured JSON manifests remain in the repository.
This separation does not change ownership or grant redistribution rights.

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

## Existing clients and Git history

The release script retains the previous two builds' `assets`, `audio`, and
`music` files using build-native inventories. This keeps pre-migration clients'
same-origin URLs available for the existing bounded retention period. New
clients use immutable R2 URLs.

Removing a payload from today's Git tree does **not** remove its historical
commits. History review/sanitization is a separate operation and must happen
before making a development history public if those old payloads must be absent.
