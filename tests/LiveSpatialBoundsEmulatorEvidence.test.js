import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/live-spatial-bounds-emulator-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function containsInclusive(observation) {
  const [minimumX, minimumZ] = observation.normalizedXzMinimum;
  const [maximumX, maximumZ] = observation.normalizedXzMaximum;
  const [objectX, , objectZ] = observation.objectPosition;
  return (
    objectX >= minimumX &&
    objectX <= maximumX &&
    objectZ >= minimumZ &&
    objectZ <= maximumZ
  );
}

test("live 0x000a evidence retains exact isolated-emulator provenance", () => {
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

test("live 0x000a evidence covers matching false and true result transitions", () => {
  assert.equal(evidence.observations.length, 2);
  const [outside, inside] = evidence.observations;

  assert.equal(containsInclusive(outside), false);
  assert.equal(outside.expectedContainment, false);
  assert.equal(outside.nativeResultArgument, 0);
  assert.equal(outside.resultSlotBefore, "0x00000000");
  assert.equal(outside.resultSlotAfter, "0x00000000");

  assert.equal(containsInclusive(inside), true);
  assert.equal(inside.expectedContainment, true);
  assert.equal(inside.nativeResultArgument, 1);
  assert.equal(inside.resultSlotBefore, "0x00000000");
  assert.equal(inside.resultSlotAfter, "0xffffffff");

  for (const observation of evidence.observations) {
    assert.equal(observation.handlerAddress, "0x0c155878");
    assert.equal(observation.handlerBreakpointAddress, "0x8c155878");
    assert.equal(observation.objectReference, "AKIR");
    assert.equal(observation.translationReference, "0x00000000");
  }
});

test("live 0x000a evidence preserves its explicit semantic boundary", () => {
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /do not assign a trigger, collision, interaction, or gameplay-domain name/i,
  );
});
