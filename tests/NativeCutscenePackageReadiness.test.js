import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  "tools/evidence/native-cutscene-package-readiness.json",
));

test("cutscene package readiness never promotes parsed AUTH data by itself", () => {
  assert.equal(report.schema, "new-yokosuka-native-cutscene-package-readiness-v2");
  assert.deepEqual(report.corpus, {
    mapinfoCount: 136,
    logicalAuthResourceCount: 491,
    uniqueAuthPayloadCount: 404,
  });
  assert.deepEqual(report.summary, {
    reviewedBindingCount: 82,
    productionBindingCount: 74,
    researchOnlyBindingCount: 8,
  });
  assert.ok(report.reviewedBindings.every(
    value => !value.programId.startsWith("preview-"),
  ), "playback wrappers must not masquerade as native ownership evidence");
  assert.deepEqual(
    report.reviewedBindings.filter(value => value.availability === "production")
      .map(value => [value.nativeBinding.resourceName, value.nativeBinding.slot])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    [
      ...Array.from({ length: 24 }, (_, index) => ["A0114", index]),
      ["BUSS", 16], ["BUSS", 16], ["BUSS", 17], ["BUSS", 17],
      ["YQ14", 0], ["YQ14", 1], ["YBHN", 27], ["DRAUTH", 0], ["DRAUTH", 1],
      ["DJHN", 20], ["DJHN", 21], ["DJHN", 22], ["DJHN", 23],
      ["DJHN", 24], ["DJHN", 25], ["DJHN", 26],
      ...Array.from({ length: 12 }, (_, index) => ["D0W0", index + 4]),
      ["EVSN", 0], ["EVSN", 1], ["EVSN", 2], ["EVSN", 3],
      ["MSKA", 0],
      ...Array.from({ length: 8 }, (_, index) => ["JHW0", index + 9]),
      ["HIHY", 0],
      ["KAKG", 2], ["KAKG", 3],
      ["BEBF", 60], ["BEBF", 61], ["BEBF", 62], ["BEBF", 63],
      ["SAKR", 0],
      ["TGMA", 0],
    ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );
  assert.deepEqual(report.blockerClusters, [
    {
      blocker: "native-realtime-interstitial-and-scene-object-FIXO-attachment-runtime-unimplemented",
      bindingCount: 3,
    },
    {
      blocker: "complete-player-facing-owner-and-dependencies-unreviewed",
      bindingCount: 2,
    },
    {
      blocker: "native-owner-resident-object-staging-not-standalone-cutscene",
      bindingCount: 2,
    },
    { blocker: "owned-by-specialized-phone-book-control-timeline", bindingCount: 1 },
  ]);
  assert.ok(report.reviewedBindings
    .filter(value => value.nativeBinding.resourceName === "A0114")
    .every(value => value.nativeBinding.kind === "map-embedded-slot"
      && value.availability === "production"
      && value.blockers.length === 0));
  assert.deepEqual(
    report.reviewedBindings
      .filter(value => value.nativeBinding.resourceName === "KAKG"
        && value.availability === "research-only")
      .map(value => [value.nativeBinding.slot, value.blockers]),
    [
      [0, ["native-owner-resident-object-staging-not-standalone-cutscene"]],
      [1, ["native-owner-resident-object-staging-not-standalone-cutscene"]],
    ],
  );
  assert.ok(
    report.reviewedBindings
      .filter(value => value.nativeBinding.resourceName === "YQ14")
      .every(value => value.blockers.length === 0),
  );
  const dnoz = report.reviewedBindings.filter(
    value => value.programId === "disc1-jd00-nozomi-tears-owner-0x5c958",
  );
  assert.deepEqual(dnoz.map(value => ({
    slot: value.nativeBinding.slot,
    member: value.authResource.archiveMember,
    sha256: value.authResource.sha256,
    availability: value.availability,
  })), [
    {
      slot: 0,
      member: "SEQDATA2.AUTH",
      sha256: "e5413316cd0d7739a7f72f23a3fe26bb12a08c31ec53d3f9bb4c314e961a4aee",
      availability: "research-only",
    },
    {
      slot: 1,
      member: "SEQDATA3.AUTH",
      sha256: "df1d41a77b7487c9da9de1e8db77dd3dd0f6f54cd57330c53abe9bbe58273466",
      availability: "research-only",
    },
  ]);
  assert.equal(
    report.reviewedBindings
      .find(value => value.nativeBinding.resourceName === "YQ14"
        && value.nativeBinding.slot === 0)
      .blockers.includes("archive-local-BIN_-scene-object-binding-unpackaged"),
    false,
  );
  assert.equal(
    report.reviewedBindings
      .find(value => value.nativeBinding.resourceName === "YQ14"
        && value.nativeBinding.slot === 1)
      .blockers.includes("archive-local-BIN_-scene-object-binding-unpackaged"),
    false,
  );
  const sakr = report.reviewedBindings.find(
    value => value.nativeBinding.resourceName === "SAKR",
  );
  assert.equal(sakr.programId, "disc1-yd01-sakura-training-owner-0x2678");
  assert.equal(sakr.gates.ownerBinding, "evidence-proven");
  assert.equal(sakr.availability, "production");
  assert.deepEqual(sakr.blockers, []);
  const tgma = report.reviewedBindings.find(
    value => value.nativeBinding.resourceName === "TGMA",
  );
  assert.equal(tgma.programId, "disc1-jhd0-fukusan-letter-0x545f8");
  assert.equal(tgma.availability, "production");
  assert.deepEqual(tgma.blockers, []);
  assert.ok(report.reviewedBindings
    .filter(value => value.nativeBinding.resourceName === "BEBF")
    .every(value => value.availability === "production"
      && value.blockers.length === 0));
});
