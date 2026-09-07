import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/"
      + "live-dialogue-participant-control-emulator-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("live participant control evidence retains isolated provenance", () => {
  assert.equal(
    evidence.provenance.emulatorBinarySha256,
    "ebb698aa5cad0b175ec6149302b49c646638ead57a95c27f7466f7d973ad3f02",
  );
  assert.equal(
    evidence.provenance.sourceStateSha256,
    evidence.provenance.isolatedStateSha256,
  );
  assert.equal(evidence.provenance.autosave, false);
  assert.match(evidence.route.input, /ordinary Dreamcast controller input/);
  assert.match(evidence.route.notes.join(" "), /no guest RAM was written/i);
});

test("natural participant control supplies the exact self-offset point", () => {
  const observation = evidence.observation;
  assert.equal(observation.targetParticipantFourcc, "HREO");
  assert.deepEqual(observation.matchedParticipantSlots, [1]);
  assert.equal(observation.activeParticipantFourccs[1], "HREO");
  assert.equal(observation.participantEnabledFlagsBefore[1], 1);
  assert.equal(
    observation.participantEnabledFlagsAtRequestReturn[1],
    1,
  );
  assert.equal(
    observation.participantEnabledFlagsAtHandlerEpilogue[1],
    0,
  );
  assert.equal(observation.selectedParticipantFourccsAfter[1], "HREO");
  assert.equal(observation.participantControlFlagsAfter[1], 1);
  assert.equal(observation.matchesStaticSelfOffsetContract, true);
  assert.ok(
    Math.abs(observation.motionTargetDeltaFromActor[0] + 0.001) < 0.00001,
  );
  assert.deepEqual(
    observation.motionTargetDeltaFromActor.slice(1),
    [0, 0],
  );
  assert.equal(observation.actorPositionPreservedAcrossRequest, true);
});

test("live participant evidence keeps unproven timing semantics explicit", () => {
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /does not assign a guessed animation name, duration, easing curve/i,
  );
});
