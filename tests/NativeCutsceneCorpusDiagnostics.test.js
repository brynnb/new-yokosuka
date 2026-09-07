import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  "tools/evidence/native-cutscene-corpus-diagnostics.json",
));

test("canonical corpus diagnostics account for every MAPINFO and logical AUTH", () => {
  assert.equal(report.schema, "new-yokosuka-native-cutscene-corpus-diagnostics-v1");
  assert.equal(report.summary.mapinfoCount, 136);
  assert.equal(report.summary.logicalAuthResourceCount, 491);
  assert.equal(
    report.summary.compiledMapinfoCount + report.summary.blockedMapinfoCount,
    report.summary.mapinfoCount,
  );
  assert.equal(
    report.summary.compiledAuthResourceCount
      + report.summary.blockedAuthResourceCount,
    report.summary.logicalAuthResourceCount,
  );
  assert.equal(report.mapinfo.length, report.summary.mapinfoCount);
  assert.equal(report.authResources.length, report.summary.logicalAuthResourceCount);
});

test("first blocker clusters are deterministic shared-capability diagnostics", () => {
  const blocked = [...report.mapinfo, ...report.authResources]
    .filter(record => record.status === "blocked");
  const clusteredIds = report.firstBlockerClusters
    .flatMap(cluster => cluster.recordIds);
  assert.equal(clusteredIds.length, blocked.length);
  assert.equal(new Set(clusteredIds).size, blocked.length);
  assert.equal(
    report.firstBlockerClusters.length,
    report.summary.firstBlockerCapabilityCount,
  );
  assert.ok(blocked.every(record => (
    record.firstBlocker?.capabilityId
    && record.firstBlocker.provenance
  )));
  assert.deepEqual(
    report.firstBlockerClusters,
    [...report.firstBlockerClusters].sort((left, right) => (
      right.recordCount - left.recordCount
      || left.capabilityId.localeCompare(right.capabilityId)
    )),
  );
});

test("AUTH parser diagnostics preserve logical resources instead of payload deduplication", () => {
  assert.equal(report.summary.compiledAuthResourceCount, 491);
  assert.equal(report.summary.blockedAuthResourceCount, 0);
  assert.ok(report.authResources.every(resource => (
    resource.status === "compiled"
    && typeof resource.payloadSha256 === "string"
    && resource.payloadSha256.length === 64
    && typeof resource.source?.path === "string"
    && Number.isInteger(resource.source?.byteLength)
  )));
});

test("legacy SCN3 programs remain explicit shared interpreter blockers", () => {
  const cluster = report.firstBlockerClusters.find(value => (
    value.capabilityId === "control-flow:unsupported-scn3-encoding"
  ));
  assert.equal(cluster?.recordCount, 17);
  const records = report.mapinfo.filter(record => (
    record.firstBlocker?.capabilityId
      === "control-flow:unsupported-scn3-encoding"
  ));
  assert.equal(records.length, 17);
  assert.ok(records.every(record => (
    record.firstBlocker.kind === "unsupportedScn3Encoding"
    && record.firstBlocker.identity
      === "legacy-instruction-stream-scn3-program"
    && record.firstBlocker.provenance.scn3EncodingMarker === "0x00000100"
    && record.firstBlocker.provenance.scn3EntryFileOffset
  )));
});
