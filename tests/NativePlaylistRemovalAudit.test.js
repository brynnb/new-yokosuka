import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import {
  auditCanonicalOwnerProgram,
  auditCompiledOwnerProgram,
  auditLegacyPlaylistSurface,
} from "../tools/lib/NativePlaylistRemovalAudit.mjs";

const readJson = filename => JSON.parse(readFileSync(filename, "utf8"));
const programPack = readJson("play/data/events/nativeEventPrograms.generated.json");

test("BEBF canonical owner graph retains all exact repeated AUTH calls", () => {
  const result = auditCanonicalOwnerProgram({
    programPack,
    activityManifest: readJson("play/assets/hazuki/bebf/manifest.json"),
    expectedOwnerCalls: [
      [60, "0x4c244"], [61, "0x4c27a"], [62, "0x4c2b0"],
      [60, "0x4c30e"], [63, "0x4c344"], [62, "0x4c37a"],
    ].map(([slot, callFileOffset]) => ({ slot, callFileOffset })),
    programId: "disc1-jomo-bebf-nightmare-owner-0x4bf5c",
    helperFunction: "0x4b4f8",
  });
  assert.deepEqual(result.ownerCalls.map(call => call.slot), [60, 61, 62, 60, 63, 62]);
  assert.equal(result.callOrderMatchesCanonicalEvidence, true);
  assert.deepEqual(result.bindings.map(binding => binding.slot), [60, 61, 62, 63]);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.unresolvedOperations, []);
  assert.equal(result.cutoverReady, true);
});

test("OP00 cutover audits its compiled owner and independent activities", () => {
  const compiledProgram = readJson(
    "play/assets/introduction/op00/cutscene-program.generated.json",
  );
  const expected = {
    id: "S1-OP00-A0114",
    area: "OP00",
    entryFunction: "0x20350",
    authoredPathToken: "/AUTH01/0114/",
    slots: Array.from({ length: 24 }, (_, index) => index),
    completionBoundarySlot: 24,
  };
  const result = auditCompiledOwnerProgram({
    compiledProgram,
    expected,
    activityManifest: readJson("play/assets/introduction/op00/manifest.json"),
  });
  assert.equal(result.identityMatches, true);
  assert.deepEqual(result.authoredResourceSelection.selectedSlots, [
    ...Array.from({ length: 24 }, (_, index) => index),
  ]);
  assert.equal(result.authoredResourceSelection.ownerCallCount, 24);
  assert.equal(result.authoredResourceSelection.exactResourceCount, 24);
  assert.equal(result.authoredResourceSelection.resourcesAreExact, true);
  assert.equal(result.authoredResourceSelection.completionBoundarySlot, 24);
  assert.equal(result.compiler.status, "compiled");
  assert.equal(result.compiler.unresolvedOperationTypeCount, 0);
  assert.equal(result.compiler.unresolvedOperationCallCount, 0);
  assert.equal(result.activityTransport.activityCount, 24);
  assert.equal(result.activityTransport.schema, "new-yokosuka-aseq-activity-pack-v1");
  assert.equal(result.activityTransport.independentlyPackaged, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.cutoverReady, true);

  const missingResourceProvenance = structuredClone(compiledProgram);
  delete missingResourceProvenance.authResourceSelection.ownerCalls[0].resource.sha256;
  const malformed = auditCompiledOwnerProgram({
    compiledProgram: missingResourceProvenance,
    expected,
    activityManifest: readJson("play/assets/introduction/op00/manifest.json"),
  });
  assert.ok(malformed.blockers.includes("owner-auth-resource-provenance-incomplete"));
  assert.equal(malformed.cutoverReady, false);
});

test("production cutscene sources contain no legacy playlist surface", () => {
  const files = [];
  const collect = directory => {
    for (const entry of readdirSync(directory)) {
      const filename = `${directory}/${entry}`;
      if (statSync(filename).isDirectory()) collect(filename);
      else if (/\.(?:js|json)$/.test(entry)) {
        files.push({ path: filename, contents: readFileSync(filename, "utf8") });
      }
    }
  };
  for (const directory of ["play/config", "play/cutscenes", "play/events", "play/data/events"]) {
    collect(directory);
  }
  const combinedAuthPack = "play/assets/introduction/op00/OP00_A0114.authpack";
  if (existsSync(combinedAuthPack)) {
    files.push({ path: combinedAuthPack, contents: "OP00_A0114.authpack" });
  }
  assert.deepEqual(auditLegacyPlaylistSurface(files), {
    references: [],
    complete: true,
  });
});
