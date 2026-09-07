import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeEventCameraRuntime,
  nativeEventCameraBrowserFrame,
  nativeEventCameraCurve,
  nativeProgramUsesEventCamera,
} from "../play/events/NativeEventCameraRuntime.js";

const programPack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

function harness(pack = programPack) {
  const applied = [];
  let releases = 0;
  const runtime = createNativeEventCameraRuntime({
    programPack: pack,
    applyNativeFrame: frame => {
      applied.push(structuredClone(frame));
      return true;
    },
    releaseNativeFrame: () => {
      releases += 1;
      return true;
    },
  });
  return {
    runtime,
    applied,
    get releases() {
      return releases;
    },
  };
}

test("AUTH preview wrappers do not acquire an unrelated room event camera", () => {
  const preview = programPack.programs.find(
    program => program.id === "preview-s1-tgma-01",
  );
  const hato = programPack.programs.find(
    program => program.id === "disc1-d000-entry-0x7abf4",
  );
  assert.equal(nativeProgramUsesEventCamera(preview), false);
  assert.equal(nativeProgramUsesEventCamera(hato), true);
});

test("two-key native curves retain endpoint slopes", () => {
  const curve = {
    count: 2,
    times: [2, 6],
    values: [10, 30],
    slopes: [3, -2],
  };
  assert.equal(nativeEventCameraCurve.evaluate(curve, 2), 10);
  assert.equal(nativeEventCameraCurve.evaluate(curve, 6), 30);
  assert.equal(nativeEventCameraCurve.evaluate(curve, 4), 22.5);
});

test("multi-key native curves evaluate their exact authored segment", () => {
  const curve = {
    count: 3,
    times: [0, 2, 5],
    values: [0, 8, 2],
    slopes: [0, 1, 0],
  };
  assert.equal(nativeEventCameraCurve.evaluate(curve, 2), 8);
  assert.equal(nativeEventCameraCurve.evaluate(curve, 5), 2);
  assert.equal(nativeEventCameraCurve.evaluate(curve, 3.5), 5.375);
});

test("Hato event camera advances its exact compact authored record", () => {
  const result = harness();
  const token = result.runtime.beginTransaction({ area: "D000" });
  assert.equal(result.runtime.requestCamera({
    cameraNumber: 2950,
    actorReferences: [null, null],
    mode: 6,
  }), true);
  assert.deepEqual(result.runtime.readFrame().position, [
    -119.67829895019531,
    1.7141000032424927,
    79.8313980102539,
  ]);

  assert.equal(result.runtime.update(2.5), true);
  const midpoint = result.runtime.readFrame();
  assert.deepEqual(midpoint.position, [
    -119.87079620361328,
    2.2749500274658203,
    79.7664566040039,
  ]);
  assert.deepEqual(midpoint.target, [
    -122.38020324707031,
    -1.2376999855041504,
    76.21749877929688,
  ]);
  assert.equal(midpoint.perspective, 59.996299743652344);

  assert.equal(result.runtime.update(10), true);
  assert.equal(result.runtime.readFrame().time, 5);
  assert.equal(result.runtime.selectMode({ mode: 0 }), true);
  assert.equal(result.releases, 1);
  assert.equal(result.runtime.commitTransaction(token), true);
});

test("event camera rejects unresolved actor-relative requests", () => {
  const result = harness();
  const token = result.runtime.beginTransaction({ area: "D000" });
  assert.equal(result.runtime.requestCamera({
    cameraNumber: 2950,
    actorReferences: ["AKIR", null],
    mode: 6,
  }), false);
  result.runtime.rollbackTransaction(token);
});

test("camera records merge across exact programs in the same area", () => {
  const result = harness();
  const token = result.runtime.beginTransaction({ area: "D000" });
  assert.equal(result.runtime.requestCamera({
    cameraNumber: 4310,
    actorReferences: [null, null],
    mode: 6,
  }), true);
  assert.equal(result.runtime.readFrame().duration, 12.5);
  assert.equal(result.runtime.update(6.166669845581055), true);
  assert.deepEqual(result.runtime.readFrame().position, [
    37.007598876953125,
    1.5478999614715576,
    10.33530044555664,
  ]);
  assert.equal(result.runtime.selectMode({ mode: 0 }), true);
  assert.equal(result.runtime.commitTransaction(token), true);
});

test("authored camera mode transitions release the owned event frame", () => {
  const result = harness();
  const token = result.runtime.beginTransaction({ area: "D000" });
  assert.equal(result.runtime.requestCamera({
    cameraNumber: 4310,
    actorReferences: [null, null],
    mode: 6,
  }), true);
  assert.equal(result.runtime.selectMode({ mode: 9 }), true);
  assert.equal(result.runtime.readFrame(), null);
  assert.equal(result.releases, 1);
  assert.equal(result.runtime.selectMode({ mode: 0 }), true);
  assert.equal(result.releases, 1);
  assert.equal(result.runtime.commitTransaction(token), true);
});

test("event camera rollback releases an owned native frame", () => {
  const result = harness();
  const token = result.runtime.beginTransaction({ area: "D000" });
  result.runtime.requestCamera({
    cameraNumber: 2954,
    actorReferences: [null, null],
    mode: 6,
  });
  assert.equal(result.runtime.rollbackTransaction(token), true);
  assert.equal(result.releases, 1);
  assert.equal(result.runtime.readFrame(), null);
});

test("event camera browser projection reflects X and view-axis roll", () => {
  assert.deepEqual(nativeEventCameraBrowserFrame({
    position: [-125, -1, 74],
    target: [-122, -0.9, 76],
    roll: -9,
    perspective: 60,
  }), {
    position: [125, -1, 74],
    target: [122, -0.9, 76],
    rollRadians: Math.PI / 20,
    perspectiveRadians: Math.PI / 3,
  });
});
