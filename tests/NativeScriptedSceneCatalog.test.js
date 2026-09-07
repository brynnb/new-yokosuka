import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeScriptedSceneCatalog,
} from "../play/events/NativeScriptedSceneCatalog.js";


const generated = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeScriptedSceneCatalog.generated.json",
  import.meta.url,
)));

test("indexes the complete catalog without promoting research entries", () => {
  const catalog = createNativeScriptedSceneCatalog(generated);
  assert.equal(catalog.listMaps().length, 136);
  assert.equal(catalog.listEntryCandidates().length, 5476);
  assert.equal(catalog.listReviewedPrograms().length, 17);
  assert.equal(
    catalog.listEntryCandidates({ availability: "reviewed-production" }).length,
    generated.summary.reviewedEntryCandidateCount,
  );
  assert.equal(
    catalog.listEntryCandidates({ availability: "research-only" }).length,
    generated.summary.availabilityStates["research-only"],
  );
});

test("resolves exact provenance and keeps reviewed descendant routes separate", () => {
  const catalog = createNativeScriptedSceneCatalog(generated);
  const program = catalog.getReviewedProgram("disc1-d000-entry-0x7abf4");
  assert.equal(program.entryFunction, "0x7abf4");
  const sourceMap = catalog.getMapBySource({
    disc: program.disc,
    area: program.area,
    mapinfoSha256: program.mapinfoSha256,
  });
  assert.ok(sourceMap.reviewedProgramIds.includes(program.id));
  assert.equal(
    sourceMap.entryCandidates.some(entry => entry.entryFunction === "0x7abf4"),
    false,
  );
});

test("resolves logical AUTH resources to canonical payload metadata", () => {
  const catalog = createNativeScriptedSceneCatalog(generated);
  const sourceMap = catalog.listMaps().find(
    item => item.authDependencies.exactMapEmbeddedResourceIds.length > 0,
  );
  const resourceId = sourceMap.authDependencies.exactMapEmbeddedResourceIds[0];
  const resource = catalog.getAuthResource(resourceId);
  assert.equal(resource.kind, "mapinfo-embedded");
  assert.equal(catalog.getAuthPayload(resource.payloadSha256).sha256, resource.payloadSha256);
});

test("rejects a catalog whose summary no longer matches its records", () => {
  assert.throws(
    () => createNativeScriptedSceneCatalog({
      ...generated,
      summary: { ...generated.summary, entryCandidateCount: 1 },
    }),
    /summary does not match/,
  );
});
