import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-speed-evidence.json",
  "utf8",
));

test("native default path step is independently observed in actor state", () => {
  assert.equal(evidence.summary.scheduledProgramCount, 151);
  assert.equal(evidence.summary.programWithControllerPointerCount, 151);
  assert.equal(evidence.summary.exactDefaultInitializationMatchCount, 133);
  assert.equal(evidence.engineEvidence.defaultBaseSpeed, 1 / 24);
  for (const observation of evidence.observations.filter((candidate) => (
    candidate.controllers.some(
      (controller) => controller.matchesDefaultInitialization,
    )
  ))) {
    assert.equal(
      observation.expectedDefaultPathStepPerNativeUpdate,
      observation.programMovementScale / 24,
    );
  }
});

test("runtime-modified movement fields remain exceptions, not defaults", () => {
  const exceptions = evidence.observations.filter((observation) => (
    !observation.controllers.some(
      (controller) => controller.matchesDefaultInitialization,
    )
  ));
  assert.equal(
    exceptions.length,
    evidence.summary.runtimeModifiedOrExceptionalCount,
  );
  assert.ok(exceptions.every(
    (observation) => observation.controllers.length > 0,
  ));
});
