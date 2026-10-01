import { runtimeAssetKey } from "../../src/RuntimeAssets.js";
import { validateSourcePath } from "../runtime-assets.mjs";

const prefix = "shenmue/runtime/";
const graceMs = 30 * 86400_000;
const canonicalKey = /^shenmue\/runtime\/[a-f0-9]{64}\/(?:play\/assets|public\/audio|public\/music)\//;

// This is a reference audit, not deletion authorization. Only an operator can
// establish that the supplied manifests cover the live and rollback builds.
export function auditRuntimeRetention({ objects, retained, now = Date.now() }) {
  if (!retained?.length) throw Error("At least one retained manifest is required");
  const references = new Map();
  const manifests = retained.map(({ label, manifest }) => {
    if (manifest?.schema !== "new-yokosuka-runtime-assets-v1" || !manifest.assets
        || Array.isArray(manifest.assets) || typeof manifest.assets !== "object")
      throw Error(`Invalid retained manifest: ${label}`);
    for (const [file, record] of Object.entries(manifest.assets)) {
      validateSourcePath(file);
      if (!record || !Number.isSafeInteger(record.size) || record.size < 0)
        throw Error(`Invalid retained size: ${label}: ${file}`);
      const key = runtimeAssetKey(file, record);
      if (references.has(key) && references.get(key) !== record.size)
        throw Error(`Conflicting retained sizes: ${key}`);
      references.set(key, record.size);
    }
    return { label, entries: Object.keys(manifest.assets).length };
  });
  const runtime = objects.filter(o => o.Key.startsWith(prefix));
  const inventory = new Map(runtime.map(o => [o.Key, o]));
  const missingReferences = [...references.keys()].filter(key => !inventory.has(key)).sort();
  const sizeMismatches = [...references].filter(([key, size]) => inventory.has(key) && inventory.get(key).Size !== size)
    .map(([key, expected]) => ({ key, expected, actual: inventory.get(key).Size }));
  const unknownKeys = [], unreferenced = [];
  for (const object of runtime) {
    try {
      if (!canonicalKey.test(object.Key)) throw Error("unknown runtime key");
      validateSourcePath(object.Key.slice(prefix.length + 65));
    } catch { unknownKeys.push(object.Key); continue; }
    if (references.has(object.Key)) continue;
    const modified = new Date(object.LastModified).getTime();
    unreferenced.push({ key: object.Key, bytes: object.Size, lastModified: object.LastModified,
      outsideGrace: Number.isFinite(modified) && modified <= now - graceMs });
  }
  return { scope: prefix, graceDays: 30, manifests, summary: {
    objects: runtime.length, bytes: runtime.reduce((s, o) => s + o.Size, 0),
    referencedObjects: runtime.filter(o => references.has(o.Key)).length,
    unreferencedObjects: unreferenced.length, unreferencedBytes: unreferenced.reduce((s, o) => s + o.bytes, 0),
    oldUnreferencedObjects: unreferenced.filter(o => o.outsideGrace).length,
    oldUnreferencedBytes: unreferenced.filter(o => o.outsideGrace).reduce((s, o) => s + o.bytes, 0),
  }, missingReferences, sizeMismatches, unknownKeys: unknownKeys.sort(),
  unreferenced: unreferenced.sort((a, b) => a.key.localeCompare(b.key)),
    deletionAuthorized: false };
}

export async function listRuntimeObjects(send, Command, bucket) {
  let token; const objects = [], seen = new Set();
  do {
    const response = await send(new Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    objects.push(...(response.Contents || []));
    if (response.IsTruncated && (!response.NextContinuationToken || seen.has(response.NextContinuationToken)))
      throw Error("Incomplete runtime inventory");
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
    if (token) seen.add(token);
  } while (token);
  return objects;
}
