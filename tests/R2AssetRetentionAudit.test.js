import test from "node:test";
import assert from "node:assert/strict";
import { runtimeAssetKey } from "../src/RuntimeAssets.js";
import { auditRuntimeRetention, listRuntimeObjects } from "../tools/lib/R2AssetRetentionAudit.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const file = "play/assets/characters/example.CHRM";
const record = { sha256: "a".repeat(64), size: 20 };
const oldRecord = { ...record, sha256: "b".repeat(64) };
const manifest = assets => ({ schema: "new-yokosuka-runtime-assets-v1", assets });
const object = (key, days = 31, size = 20) => ({ Key: key, Size: size, LastModified: new Date(now - days * 86400_000) });

test("current and explicitly retained rollback manifests protect their distinct content versions", () => {
  const retained = [{ label: "pending", manifest: manifest({ [file]: record }) },
    { label: "rollback", manifest: manifest({ [file]: oldRecord }) }];
  const result = auditRuntimeRetention({ now, retained, objects: [object(runtimeAssetKey(file, record)), object(runtimeAssetKey(file, oldRecord))] });
  assert.equal(result.summary.referencedObjects, 2);
  assert.deepEqual(result.unreferenced, []);
  assert.deepEqual(result.missingReferences, []);
  assert.equal(result.deletionAuthorized, false);
});

test("unreferenced files are reported with a grace window; libraries/media and malformed keys never qualify", () => {
  const orphan = runtimeAssetKey(file, oldRecord), recent = runtimeAssetKey("public/music/recent.ogg", record);
  const retained = [{ label: "live", manifest: manifest({ [file]: record }) }];
  const objects = [object(runtimeAssetKey(file, record)), object(orphan), object(recent, 5),
    object("shenmue/runtime/unknown"), object("shenmue/models/library.MT5"), object("media/movie.m3u8")];
  const result = auditRuntimeRetention({ now, retained, objects });
  assert.equal(result.summary.objects, 4);
  assert.equal(result.summary.oldUnreferencedObjects, 1);
  assert.equal(result.summary.unreferencedObjects, 2);
  assert.equal(result.unreferenced.find(o => o.key === orphan).outsideGrace, true);
  assert.equal(result.unreferenced.find(o => o.key === recent).outsideGrace, false);
  assert.deepEqual(result.unknownKeys, ["shenmue/runtime/unknown"]);
});

test("invalid manifests fail rather than silently omitting their references", () => {
  for (const assets of [{ [file]: { ...record, sha256: "invalid" } },
    { [file]: { ...record, size: -1 } }, { "play/assets/../../private": record }]) {
    assert.throws(() => auditRuntimeRetention({ objects: [], retained: [{ label: "bad", manifest: manifest(assets) }] }));
  }
  assert.throws(() => auditRuntimeRetention({ objects: [], retained: [{ label: "bad", manifest: {} }] }), /Invalid retained manifest/);
  assert.throws(() => auditRuntimeRetention({ objects: [], retained: [] }), /At least one/);
});

test("missing publications and wrong remote sizes remain explicit failures in the report", () => {
  const retained = [{ label: "live", manifest: manifest({ [file]: record }) }];
  assert.deepEqual(auditRuntimeRetention({ now, retained, objects: [] }).missingReferences, [runtimeAssetKey(file, record)]);
  const result = auditRuntimeRetention({ now, retained, objects: [object(runtimeAssetKey(file, record), 31, 19)] });
  assert.equal(result.sizeMismatches.length, 1);
  assert.equal(result.summary.unreferencedObjects, 0);
  assert.equal(result.deletionAuthorized, false);
});

test("listing is limited to runtime assets and refuses incomplete pagination", async () => {
  class Command { constructor(input) { this.input = input; } }
  const calls = [];
  const send = async ({ input }) => { calls.push(input); return input.ContinuationToken
    ? { Contents: [object("two")] } : { Contents: [object("one")], IsTruncated: true, NextContinuationToken: "next" }; };
  assert.equal((await listRuntimeObjects(send, Command, "test")).length, 2);
  assert.ok(calls.every(c => c.Bucket === "test" && c.Prefix === "shenmue/runtime/"));
  await assert.rejects(listRuntimeObjects(async () => ({ IsTruncated: true }), Command, "test"), /Incomplete/);
  await assert.rejects(listRuntimeObjects(async () => ({ IsTruncated: true, NextContinuationToken: "same" }), Command, "test"), /Incomplete/);
});
