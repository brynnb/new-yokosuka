import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-pelvis-callback-conformance.json",
  import.meta.url,
), "utf8"));

function hermiteFixedTurns(curve, time) {
  let value;
  if (time <= curve.startTime) {
    value = curve.startValue;
  } else if (time >= curve.endTime || curve.endTime - curve.startTime <= 1e-7) {
    value = curve.endValue;
  } else {
    const duration = curve.endTime - curve.startTime;
    const amount = (time - curve.startTime) / duration;
    const amount2 = amount * amount;
    const amount3 = amount2 * amount;
    value = (
      (2 * amount3 - 3 * amount2 + 1) * curve.startValue
      + (amount3 - 2 * amount2 + amount) * duration * curve.startTangent
      + (-2 * amount3 + 3 * amount2) * curve.endValue
      + (amount3 - amount2) * duration * curve.endTangent
    );
  }
  return Math.trunc(value * 65536 / (2 * Math.PI));
}

test("S2 pelvis callback reads the installed controller axis descriptors", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-s2-pelvis-callback-conformance-v1",
  );
  const controller = Number.parseInt(
    evidence.observation.controllerAddress.slice(2),
    16,
  );
  assert.deepEqual(
    evidence.observation.axes.map(({ curveIndex }) => curveIndex),
    [3, 4, 5],
  );
  assert.deepEqual(
    evidence.observation.axes.map(({ controllerOffset }) => controllerOffset),
    [0x170, 0x1b0, 0x1f0],
  );
  assert.deepEqual(
    evidence.observation.axes.map(({ descriptorAddress }) => (
      Number.parseInt(descriptorAddress.slice(2), 16) - controller
    )),
    [0x170, 0x1b0, 0x1f0],
  );
  assert.deepEqual(
    evidence.observation.contextAxisPointers,
    evidence.observation.axes.map(({ descriptorAddress }) => descriptorAddress),
  );
});

test("browser callback scalar evaluation exactly matches native fixed turns", () => {
  assert.deepEqual(evidence.observation.nativeFixedTurns, [0, -973, 0]);
  assert.deepEqual(
    evidence.observation.browserFixedTurns,
    evidence.observation.nativeFixedTurns,
  );
  assert.equal(evidence.observation.exactFixedTurnMatch, true);
  for (const axis of evidence.observation.axes) {
    assert.equal(
      hermiteFixedTurns(
        axis.hermite,
        evidence.observation.currentCurveTime,
      ),
      axis.nativeHelper.fixedTurns,
    );
    assert.equal(axis.exactFixedTurnMatch, true);
  }
  assert.ok(
    evidence.observation.primaryMatrixConformance.orientationErrorDegrees
      < 0.019,
  );
  assert.equal(
    evidence.observation.primaryMatrixConformance.maximumAcceptedErrorDegrees,
    0.05,
  );
  assert.equal(evidence.observation.primaryMatrixConformance.passes, true);
});

test("S2 pelvis callback uses the proven native Z/Y/X helper order", () => {
  assert.deepEqual(
    evidence.sh4.matrixHelperOrder,
    [
      {
        helperAddress: "0x8c1e0040",
        callbackReturnAddress: "0x8c0e7fba",
        nativeAxis: "Z",
      },
      {
        helperAddress: "0x8c1dff90",
        callbackReturnAddress: "0x8c0e7fcc",
        nativeAxis: "Y",
      },
      {
        helperAddress: "0x8c1dfed0",
        callbackReturnAddress: "0x8c0e7fde",
        nativeAxis: "X",
      },
    ],
  );
  assert.equal(evidence.sh4.scalarCurveEvaluatorAddress, "0x8c1cdee0");
});
