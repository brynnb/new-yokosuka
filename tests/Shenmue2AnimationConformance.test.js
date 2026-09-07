import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  conformanceFailures,
  nativePoseMetrics,
  runShenmue2AnimationConformance,
  validateShenmue2AnimationFixture,
} from "../tools/lib/Shenmue2AnimationConformance.js";

const fixtureUrl = new URL(
  "./fixtures/shenmue2-animation/f086-jn5-native.json",
  import.meta.url,
);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
const shortRigFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/f09e-syb-native.json",
  import.meta.url,
), "utf8"));
const kmnFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/f060-kmn-native.json",
  import.meta.url,
), "utf8"));
const llyActionFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/e11b-om2-native.json",
  import.meta.url,
), "utf8"));
const blendedSeiFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/e26a-ok1-native.json",
  import.meta.url,
), "utf8"));
const blendedAriFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/f03e-cca-blended-native.json",
  import.meta.url,
), "utf8"));
const foundationFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/native-foundation.json",
  import.meta.url,
), "utf8"));
const ryoTerrainFixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/f002-ryo_m-native.json",
  import.meta.url,
), "utf8"));

test("S2 native root/pelvis ownership is stable across actors and motions", () => {
  assert.equal(
    foundationFixture.schema,
    "new-yokosuka-s2-native-foundation-fixture-v1",
  );
  assert.equal(foundationFixture.sampleCount, 106);
  assert.equal(foundationFixture.motionIds.length, 10);
  const grouped = Object.groupBy(
    foundationFixture.samples,
    ({ motionId, controllerAddress }) => `${motionId}:${controllerAddress}`,
  );
  let maximumHorizontalPelvisOffset = 0;
  let maximumPerActorVerticalOffsetRange = 0;
  for (const sample of foundationFixture.samples) {
    const [x, y, z] = sample.nativePelvisFromActorRoot;
    assert.ok([x, y, z, sample.compactRootPosition.y].every(Number.isFinite));
    maximumHorizontalPelvisOffset = Math.max(
      maximumHorizontalPelvisOffset,
      Math.hypot(x, z),
    );
  }
  for (const samples of Object.values(grouped)) {
    const offsets = samples.map((sample) => (
      sample.nativePelvisFromActorRoot[1]
      - sample.compactRootPosition.y
    ));
    maximumPerActorVerticalOffsetRange = Math.max(
      maximumPerActorVerticalOffsetRange,
      Math.max(...offsets) - Math.min(...offsets),
    );
  }
  // Across ten native motion families, +0x08 owns horizontal travel: the
  // pelvis remains within 3.2 cm of that axis. Compact root Y drives pelvis
  // height plus a stable per-rig rest offset, rather than being a second
  // whole-character translation.
  assert.ok(maximumHorizontalPelvisOffset < 0.033);
  assert.ok(maximumPerActorVerticalOffsetRange < 0.012);
});

test("S2 native fixture retains all five solver slots and 19 matrices", () => {
  validateShenmue2AnimationFixture(fixture);
  assert.ok(fixture.frames.length >= 10);
  assert.deepEqual(
    fixture.frames[0].slotMotionIds.slice(0, 4),
    new Array(4).fill(0xf086),
  );
  assert.equal(fixture.frames[0].slotMotionIds[4], 0x80d6);
  for (const frame of fixture.frames) {
    assert.equal(nativePoseMetrics(frame).outputCount, 19);
    assert.match(frame.controllerAddress, /^0x[0-9a-f]+$/);
    assert.equal(
      frame.nativeSolverInputs.pelvisRootTranslationMatrix?.length,
      16,
    );
    assert.equal(
      frame.nativeSolverInputs.pelvisPrimaryWorldMatrix?.length,
      16,
    );
  }
});

test("reduced S2 renderer fixtures retain native intermediate arm matrices", () => {
  const reducedFixture = JSON.parse(fs.readFileSync(new URL(
    "./fixtures/shenmue2-animation/80eb-a06_e-native.json",
    import.meta.url,
  ), "utf8"));
  validateShenmue2AnimationFixture(reducedFixture);
  assert.equal(reducedFixture.actorScale, 1);
  assert.equal(reducedFixture.motionTranslationScale, 1);
  for (const frame of reducedFixture.frames) {
    assert.equal(nativePoseMetrics(frame).outputCount, 19);
    assert.equal(frame.matrixProvenance.renderedOffsets.length, 17);
    assert.deepEqual(
      frame.matrixProvenance.directControllerOffsets,
      [0x1690, 0x1c10],
    );
  }
  const report = runShenmue2AnimationConformance(reducedFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  assert.deepEqual(conformanceFailures(report), []);
  const intermediatePointErrors = report.frames.flatMap(({ pointErrors }) => (
    Object.entries(pointErrors)
      .filter(([name]) => !name.endsWith("Terminal"))
      .map(([, error]) => error)
  ));
  const terminalPointErrors = report.frames.flatMap(({ pointErrors }) => (
    Object.entries(pointErrors)
      .filter(([name]) => name.endsWith("Terminal"))
      .map(([, error]) => error)
  ));
  assert.ok(Math.max(...intermediatePointErrors) < 0.00005);
  // Terminal matrices were added after the original intermediate-matrix
  // bound. Their captured float32 world positions have a 60-micrometre error
  // floor, so keep them explicit instead of silently broadening that bound.
  assert.ok(Math.max(...terminalPointErrors) < 0.00006);
  assert.ok(report.summary.maximumOrientationErrorDegrees < 0.007);
});

test("S2 foundation comparison removes only native slot-zero X/Z residue", () => {
  const xhoFixture = JSON.parse(fs.readFileSync(new URL(
    "./fixtures/shenmue2-animation/e381-xho-native.json",
    import.meta.url,
  ), "utf8"));
  const report = runShenmue2AnimationConformance(xhoFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  const relocatedCapture = report.frames.find(({ sourceFrame }) => (
    sourceFrame === 10
  ));
  assert.ok(relocatedCapture);
  assert.ok(
    relocatedCapture.foundation.discardedNativePrimaryHorizontalResidue
      > 0.0002,
  );
  assert.ok(relocatedCapture.foundation.pelvisPositionError < 0.000025);
  assert.equal(
    relocatedCapture.foundation.rawNativePelvisFromRoot[1],
    relocatedCapture.foundation.nativePelvisFromRoot[1],
  );
  assert.ok(relocatedCapture.foundation.browserHorizontalRootDrift < 1e-7);
  assert.ok(
    Math.hypot(
      relocatedCapture.foundation.rawNativePelvisFromRoot[0]
        - relocatedCapture.foundation.nativePelvisFromRoot[0],
      relocatedCapture.foundation.rawNativePelvisFromRoot[2]
        - relocatedCapture.foundation.nativePelvisFromRoot[2],
    ) > 0.0002,
  );
});

test("S2 conformance runs the browser pose implementation at native frames", () => {
  const report = runShenmue2AnimationConformance(fixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  assert.equal(report.frameCount, fixture.frames.length);
  assert.ok(report.frames.some(({ sourceFrame }) => sourceFrame === 8));
  assert.ok(report.summary.maximumLengthError < 0.001);
  assert.ok(report.summary.maximumHorizontalRootDrift < 1e-7);
  assert.ok(report.summary.maximumPelvisPositionError < 0.001);
  assert.ok(report.summary.maximumPelvisOrientationErrorDegrees < 1);
  const torsoPointErrors = report.frames.map(
    ({ pointErrors }) => pointErrors.torso,
  );
  const torsoOrientationErrors = report.frames.map(
    ({ orientationErrors }) => orientationErrors.torso,
  );
  assert.ok(Math.max(...torsoPointErrors) < 0.0012);
  assert.ok(Math.max(...torsoOrientationErrors) < 0.8);
  const ordinaryHeadOrientationErrors = report.frames
    .filter(({ sourceFrame }) => sourceFrame !== 31)
    .map(({ orientationErrors }) => orientationErrors.head);
  assert.ok(Math.max(...ordinaryHeadOrientationErrors) < 0.2);
  assert.ok(report.frames.find(
    ({ sourceFrame }) => sourceFrame === 31,
  ).orientationErrors.head < 0.9);
  const ordinaryLegErrors = report.frames
    .filter(({ sourceFrame }) => sourceFrame !== 31)
    .flatMap(({ limbs }) => [
      limbs.legA.bendErrorDegrees,
      limbs.legB.bendErrorDegrees,
    ]);
  assert.ok(Math.max(...ordinaryLegErrors) < 0.07);
  const ordinaryLegOrientationErrors = report.frames
    .filter(({ sourceFrame }) => sourceFrame !== 31)
    .flatMap(({ orientationErrors }) => [
      orientationErrors.legAUpper,
      orientationErrors.legAKnee,
      orientationErrors.legBUpper,
      orientationErrors.legBKnee,
    ]);
  assert.ok(Math.max(...ordinaryLegOrientationErrors) < 0.3);
  const ordinaryFootOrientationErrors = report.frames
    .filter(({ sourceFrame }) => sourceFrame !== 31)
    .flatMap(({ orientationErrors }) => [
      orientationErrors.legAFoot,
      orientationErrors.legBFoot,
    ]);
  assert.ok(Math.max(...ordinaryFootOrientationErrors) < 0.2);
  assert.ok(report.frames.find(
    ({ sourceFrame }) => sourceFrame === 31,
  ).limbs.legA.bendErrorDegrees < 3);
  const armBendErrors = report.frames.flatMap(({ limbs }) => [
    limbs.armA.bendErrorDegrees,
    limbs.armB.bendErrorDegrees,
  ]);
  assert.ok(Math.max(...armBendErrors) < 0.75);
  const armHandPointErrors = report.frames.flatMap(({ pointErrors }) => [
    pointErrors.armAHand,
    pointErrors.armBHand,
  ]);
  assert.ok(Math.max(...armHandPointErrors) < 0.07);
  const armHandOrientationErrors = report.frames.flatMap(
    ({ orientationErrors }) => [
      orientationErrors.armAHand,
      orientationErrors.armBHand,
    ],
  );
  assert.ok(Math.max(...armHandOrientationErrors) < 0.8);
  assert.deepEqual(
    conformanceFailures(report, report.regressionThresholds),
    [],
  );
  assert.deepEqual(conformanceFailures(report), []);
});

test("S2 conformance applies the exact captured SYB rest-rig binding", () => {
  validateShenmue2AnimationFixture(shortRigFixture);
  const report = runShenmue2AnimationConformance(shortRigFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  assert.equal(report.frameCount, shortRigFixture.frames.length);
  const exactFrame = report.frames.find(({ sourceFrame }) => sourceFrame === 21);
  assert.ok(exactFrame);
  assert.ok(exactFrame.foundation.pelvisPositionError < 0.00002);
  assert.ok(exactFrame.pointErrors.torso < 0.00001);
  assert.ok(exactFrame.limbs.legA.bendErrorDegrees < 5);
  assert.ok(exactFrame.limbs.legB.bendErrorDegrees < 2);
  assert.ok(exactFrame.orientationErrors.legAUpper < 2.5);
  assert.ok(exactFrame.orientationErrors.legAKnee < 2.6);
  assert.ok(exactFrame.orientationErrors.legBUpper < 1);
  assert.ok(exactFrame.orientationErrors.legBKnee < 1);
  assert.ok(exactFrame.orientationErrors.legAFoot < 0.02);
  assert.ok(exactFrame.orientationErrors.legBFoot < 0.03);
  assert.ok(exactFrame.orientationErrors.head < 0.001);
  assert.ok(exactFrame.limbs.armA.bendErrorDegrees < 0.01);
  assert.ok(exactFrame.limbs.armB.bendErrorDegrees < 0.01);
  assert.ok(exactFrame.orientationErrors.armAShoulder < 0.001);
  assert.ok(exactFrame.orientationErrors.armAElbow < 0.001);
  assert.ok(exactFrame.orientationErrors.armBShoulder < 0.001);
  assert.ok(exactFrame.orientationErrors.armBElbow < 0.001);
  assert.ok(exactFrame.orientationErrors.armAHand < 0.001);
  assert.ok(exactFrame.orientationErrors.armBHand < 0.001);
  const armPointErrors = Object.entries(exactFrame.pointErrors)
    .filter(([name]) => (
      name.startsWith("arm") && !name.endsWith("Terminal")
    ))
    .map(([, error]) => error);
  assert.ok(Math.max(...armPointErrors) < 0.00002);
  const armTerminalPointErrors = Object.entries(exactFrame.pointErrors)
    .filter(([name]) => (
      name.startsWith("arm") && name.endsWith("Terminal")
    ))
    .map(([, error]) => error);
  assert.ok(Math.max(...armTerminalPointErrors) < 0.00003);
  assert.ok(exactFrame.maximumLengthError < 0.00001);
  assert.deepEqual(
    conformanceFailures(report, report.regressionThresholds),
    [],
  );
  assert.deepEqual(conformanceFailures(report), []);
});

test("S2 conformance rejects mixed-phase KMN callback captures", () => {
  assert.equal(kmnFixture.provenance.modelBinding.restProfile, "KMN");
  assert.equal(
    kmnFixture.provenance.modelBinding.exactRenderedModelIdentity,
    "resolved",
  );
  assert.equal(kmnFixture.provenance.modelBinding.actorCode, "06H_");
  assert.equal(kmnFixture.provenance.modelBinding.modelCode, "BA7_L");
  const report = runShenmue2AnimationConformance(kmnFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  assert.equal(report.frameCount, kmnFixture.frames.length);
  assert.ok(report.frameCount >= 6);
  assert.equal(kmnFixture.status, "strict-native");
  assert.equal(
    kmnFixture.provenance.callbackPhaseCoherence.rejectedFrameCount,
    2,
  );
  assert.deepEqual(
    kmnFixture.provenance.callbackPhaseCoherence.rejectedFrames.map(
      ({ sourceFrame }) => sourceFrame,
    ),
    [25, 31],
  );
  assert.ok(report.summary.maximumDecodedPelvisOrientationErrorDegrees < 0.024);
  assert.deepEqual(conformanceFailures(report), []);
});

test("S2 conformance covers an exact LLY native action with live curve state", () => {
  assert.equal(llyActionFixture.provenance.modelBinding.actorCode, "07E_");
  assert.equal(llyActionFixture.provenance.modelBinding.modelCode, "OM2_L");
  assert.equal(llyActionFixture.provenance.modelBinding.restProfile, "LLY");
  assert.equal(llyActionFixture.provenance.runtimeCurveAffines.policy, "any");
  assert.ok(llyActionFixture.frames.every(
    (frame) => frame.nativeSolverInputs.curveAffines.length > 0,
  ));
  const report = runShenmue2AnimationConformance(llyActionFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  assert.equal(report.frameCount, 5);
  assert.ok(report.summary.maximumPointError < 0.0002);
  assert.ok(report.summary.maximumOrientationErrorDegrees < 0.04);
  assert.deepEqual(conformanceFailures(report), []);
});

test("S2 raw MOT decoding independently reproduces captured curve evaluation", () => {
  for (const nativeFixture of [
    fixture,
    llyActionFixture,
    blendedSeiFixture,
    blendedAriFixture,
  ]) {
    const captured = runShenmue2AnimationConformance(nativeFixture, {
      repositoryRoot: new URL("..", import.meta.url).pathname,
    });
    const decoded = runShenmue2AnimationConformance(nativeFixture, {
      repositoryRoot: new URL("..", import.meta.url).pathname,
      useCapturedEvaluatedCurveValues: false,
    });
    assert.equal(captured.curveInputMode, "captured-evaluated-values");
    assert.equal(decoded.curveInputMode, "decoded-mot-values");
    for (const metric of Object.keys(captured.summary)) {
      assert.ok(
        Math.abs(captured.summary[metric] - decoded.summary[metric]) < 0.0001,
        `${nativeFixture.id} ${metric} diverged between captured and decoded curves`,
      );
    }
    assert.deepEqual(conformanceFailures(decoded), []);
  }
});

test("S2 pelvis callback evidence proves production controller 0", () => {
  assert.equal(blendedAriFixture.status, "strict-native");
  assert.equal(
    blendedAriFixture.provenance.callbackPhaseCoherence.rejectedFrameCount,
    2,
  );
  assert.ok(blendedAriFixture.frames.every((frame) => (
    frame.nativeSolverInputs.pelvisPrimaryCallback?.callbackAddress
      === 0x8c0e7f00
  )));
  assert.ok(blendedAriFixture.frames.every((frame) => {
    const callback = frame.nativeSolverInputs.pelvisPrimaryCallback;
    return callback.branch === "fixed-axis"
      && callback.mode === 0
      && callback.modeSource === "global-fallback"
      && callback.capturedBlendAmount === 1
      && callback.effectiveBlendAmount === 1
      && callback.axisSourceSelection === "installed-controller-descriptors"
      && callback.axisSourcesAtCall.length === 3
      && callback.axisSourcesAtCall.every((source, axis) => (
        source.curveIndex === axis + 3
        && Math.abs(
          source.evaluatedValue
            - frame.nativeSolverInputs.evaluatedCurveValues[axis + 3],
        ) < 1e-7
      ));
  }));
  const report = runShenmue2AnimationConformance(blendedAriFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  assert.ok(report.summary.maximumPelvisOrientationErrorDegrees < 0.00001);
  assert.ok(report.summary.maximumDecodedPelvisOrientationErrorDegrees < 0.024);
  assert.deepEqual(conformanceFailures(report), []);
});

test("S2 fixture validation cannot silently retain a torn callback frame", () => {
  const torn = structuredClone(blendedAriFixture);
  const callbackFrame = torn.frames.find((frame) => (
    frame.nativeSolverInputs.pelvisPrimaryCallback?.branch === "fixed-axis"
  ));
  assert.ok(callbackFrame);
  callbackFrame.nativeSolverInputs.pelvisPrimaryCallback
    .axisSourcesAtCall[1].evaluatedValue += 0.1;
  assert.throws(
    () => validateShenmue2AnimationFixture(torn),
    /mixes callback phases/,
  );

  const unaudited = structuredClone(blendedAriFixture);
  unaudited.provenance.callbackPhaseCoherence.rejectedFrameCount = 0;
  assert.throws(
    () => validateShenmue2AnimationFixture(unaudited),
    /invalid callback phase-coherence provenance/,
  );
});

test("S2 mode-one pelvis fixtures require the complete native direction pair", () => {
  const candidate = structuredClone(blendedAriFixture);
  const callback = candidate.frames[0].nativeSolverInputs
    .pelvisPrimaryCallback;
  callback.mode = 1;
  callback.branch = "direction-up-blend";
  assert.throws(
    () => validateShenmue2AnimationFixture(candidate),
    /invalid pelvis primary callback/,
  );
  callback.directionBlend = {
    address: "0x8c7e6958",
    addressControllerOffset: 0x270,
    currentFrame: 9,
    blendEndFrame: 12,
    targetForward: [0.9871639609336853, 0, -0.15971001982688904],
    targetUp: [0, 1, 0],
    sourceForward: [
      0.9999698400497437,
      0.00000967875894275494,
      0.0077656893990933895,
    ],
    sourceUp: [0, 0.9999992251396179, -0.0012463480234146118],
  };
  validateShenmue2AnimationFixture(candidate);
});

test("S2 Ryo conformance consumes native terrain-adjusted foot targets", () => {
  assert.ok(ryoTerrainFixture.frames.some((frame) => (
    frame.nativeSolverInputs.terrainAdjustedLegTargets?.length === 2
  )));
  assert.ok(ryoTerrainFixture.frames.some((frame) => (
    frame.nativeSolverInputs.headMiddleCallback?.blendAmount === 1
  )));
  const report = runShenmue2AnimationConformance(ryoTerrainFixture, {
    repositoryRoot: new URL("..", import.meta.url).pathname,
  });
  const bodyOrientationErrors = report.frames.flatMap(
    ({ orientationErrors }) => Object.entries(orientationErrors)
      .filter(([name]) => name !== "head")
      .map(([, error]) => error),
  );
  // Player-only terrain inputs reproduce both legs without the former
  // 75-degree knee failure. The independently captured current-actor head
  // callback also removes the former constant 1.9116-degree residual.
  assert.ok(report.summary.maximumPointError < 0.0002);
  assert.ok(report.summary.maximumBendErrorDegrees < 0.02);
  assert.ok(Math.max(...bodyOrientationErrors) < 0.03);
  assert.ok(report.summary.maximumOrientationErrorDegrees < 0.03);
});
