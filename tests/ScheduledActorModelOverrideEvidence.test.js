import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  scheduledDescriptorState,
} from "../tools/lib/ScheduledActorOfflineRuntime.js";
import {
  scheduledActorModelCode,
} from "../src/ScheduledActorPresentation.js";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-model-override-evidence.json",
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));
const assets = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actor-assets.json",
  "utf8",
));

test("operation 0x2f has exact native model-override semantics", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.relevantCaptureCount, 227);
  assert.equal(evidence.summary.sourceOperationCount, 16);
  assert.equal(evidence.summary.sourcePersistentOverrideOperationCount, 6);
  assert.equal(evidence.summary.sourceClearedOverrideOperationCount, 10);
  assert.equal(evidence.summary.sourceActorCodeCount, 1);
  assert.equal(evidence.summary.distinctSourceModelOverrideCodeCount, 2);
  assert.equal(evidence.summary.runtimeActorObservationCount, 227);
  assert.equal(evidence.summary.emptyRuntimeOverrideObservationCount, 226);
  assert.equal(evidence.summary.nonemptyRuntimeOverrideObservationCount, 1);
  assert.equal(
    evidence.summary.sourcePersistentModelCodeRuntimeObservationCount,
    1,
  );
  assert.equal(
    evidence.summary.unmatchedNonemptyRuntimeOverrideObservationCount,
    0,
  );
  assert.equal(evidence.summary.actorResolutionErrorCount, 0);
  assert.equal(evidence.summary.emptyStringByteObservationCount, 227);
  assert.equal(evidence.summary.nonzeroEmptyStringByteObservationCount, 0);
  assert.equal(evidence.nativeEvidence.handlerAddress, "0x0c11acd8");
  assert.equal(evidence.nativeEvidence.actorModelPointerOffset, "0x8c");
  assert.equal(evidence.nativeEvidence.actorModelOverrideOffset, "0x18e");
  assert.equal(evidence.nativeEvidence.modelOverrideBufferLength, 12);
});

test("the live FUB_M override agrees with source timing and actor state", () => {
  const live = evidence.observations.filter(
    (observation) => observation.modelOverridePresent,
  );
  assert.equal(live.length, 1);
  assert.equal(live[0].actorCode, "FUKU");
  assert.equal(live[0].likelyArea, "JHD0");
  assert.equal(live[0].schedulerClockSecond, 60939);
  assert.equal(live[0].modelOverrideCode, "FUB_M");
  assert.equal(live[0].modelOverrideRawBytes, "4655425f4d00000000000000");
  assert.equal(live[0].actorCharacterIndex, 105);
  assert.notEqual(live[0].actorModelPointer, "0x00000000");
  assert.equal(live[0].sourcePersistentModelCodeMatch, true);
});

test("browser schedules and assets implement the alternate Fukuhara model", () => {
  const fuku = manifest.actors.find((actor) => actor.actorCode === "FUKU");
  assert.ok(fuku);
  assert.equal(fuku.modelCode, "FUK_M");
  assert.deepEqual(fuku.modelOverrides, [{
    modelCode: "FUB_M",
    textureFile: "FUB_textures.bin",
    evidence: "exact operation-0x2f model override and HUMANS asset",
  }]);
  const operations = fuku.scheduleVariants.flatMap(
    (variant) => variant.journeys.flatMap(
      (journey) => journey.operations.filter(
        (operation) => operation.operation === 0x2f,
      ),
    ),
  );
  assert.equal(operations.length, 16);
  assert.equal(
    operations.filter((operation) => operation.modelOverridePersistent).length,
    6,
  );
  assert.equal(
    operations.filter(
      (operation) => operation.modelOverrideCode === "FUB_M",
    ).length,
    6,
  );
  assert.ok(operations.every(
    (operation) => Number.isFinite(operation.descriptorActivationSecond),
  ));
  assert.ok(operations.every(
    (operation) => (
      operation.modelOverrideEvidence.runtimeEvidence
      === "tools/evidence/scheduled-actor-model-override-evidence.json"
    ),
  ));
  assert.ok(assets.assets.some(
    (asset) => (
      asset.assetModelCode === "FUB_M"
      && asset.modelFile === "FUB_M.CHRM"
      && asset.textureFile === "FUB_textures.bin"
    ),
  ));
  assert.equal(assets.summary.mappedModelCount, 225);
  assert.equal(assets.summary.modelOverrideCount, 1);
  assert.equal(assets.summary.resolvedAssetCount, 226);
  assert.equal(manifest.summary.modelOverrideOperationCount, 16);
  assert.equal(manifest.summary.persistentModelOverrideOperationCount, 6);
  assert.equal(manifest.summary.clearedModelOverrideOperationCount, 10);
  assert.equal(manifest.summary.liveModelOverrideObservationCount, 1);
});

test("browser Fukuhara state matches the live override and native clear", () => {
  const fuku = manifest.actors.find((actor) => actor.actorCode === "FUKU");
  const schedule = fuku.scheduleVariants.find(
    (variant) => variant.scheduleVariantId === fuku.defaultScheduleVariantId,
  );
  const definition = { ...fuku, journeys: schedule.journeys };
  const at = (second) => {
    const date = new Date(Date.UTC(2000, 0, 1));
    date.setUTCSeconds(second);
    return scheduledDescriptorState(definition, date, manifest.areaWorlds);
  };
  for (const second of [60939, 63000, 68399, 68400]) {
    const state = at(second);
    assert.equal(state.modelOverrideCode, "FUB_M");
    assert.equal(scheduledActorModelCode(definition, state), "FUB_M");
  }
  const cleared = at(70000);
  assert.equal(cleared.modelOverrideCode, null);
  assert.equal(scheduledActorModelCode(definition, cleared), "FUK_M");
});
