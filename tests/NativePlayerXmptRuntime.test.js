import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativePlayerXmptRuntime,
} from "../play/events/NativePlayerXmptRuntime.js";

function animationHarness() {
  let revision = 0;
  return {
    activeOneShot: null,
    requests: [],
    releases: [],
    nativeMotionDescriptor(request) {
      if (request === 0x055e) {
        return {
          rootMotionKind: "travel",
          speed: 1.5,
          gameTicksPerCycle: 60,
        };
      }
      if (request === 594) {
        return {
          rootMotionKind: null,
          speed: 1,
          gameTicksPerCycle: 150,
        };
      }
      return null;
    },
    playNativeMotionRequest(request, options) {
      this.requests.push({ request, options });
      this.activeOneShot = {
        playbackRevision: ++revision,
        context: options.context,
      };
      return true;
    },
    releaseOneShot(nextState) {
      if (!this.activeOneShot) return false;
      this.releases.push(nextState);
      this.activeOneShot = null;
      return true;
    },
  };
}

test("player XMPT follows exact route progress and commits its endpoint", () => {
  const animation = animationHarness();
  let transform = {
    position: [-119, -1.8, 78],
    facingRaw: 0,
  };
  const writes = [];
  const runtime = createNativePlayerXmptRuntime({
    getAnimation: () => animation,
    readNativeTransform: () => structuredClone(transform),
    writeNativeTransform: next => {
      transform = structuredClone(next);
      writes.push(structuredClone(next));
      return true;
    },
  });
  const token = runtime.beginTransaction();
  const controller = runtime.controller();
  const target = [-122, -1.8, 78];
  assert.equal(controller.startMotion({
    actorTag: "AKIR",
    phase: "approach",
    target,
    facing: { kind: "target-bearing" },
    request: 0x055e,
  }), true);
  assert.equal(transform.facingRaw, 0xc000);
  assert.equal(controller.readMotionRequestWord({
    actorTag: "AKIR",
    phase: "approach",
  }), 0x055e);
  assert.equal(animation.requests[0].options.applyRootMotion, false);

  assert.equal(runtime.update(1), true);
  assert.deepEqual(transform.position, [
    -120.5,
    Math.fround(-1.8),
    78,
  ]);
  assert.equal(runtime.update(1), true);
  assert.deepEqual(transform.position, [-121.8, -1.8, 78].map(Math.fround));
  assert.equal(controller.readMotionRequestWord({
    actorTag: "AKIR",
    phase: "approach",
  }), 0);
  assert.equal(controller.commitTarget({
    actorTag: "AKIR",
    phase: "approach",
  }), true);
  assert.equal(controller.convergeFacing({
    actorTag: "AKIR",
    target,
    maximumStepRaw: 2730,
  }), true);
  assert.deepEqual(animation.releases, ["idle"]);
  assert.equal(runtime.commitTransaction(token), true);
  assert.equal(writes.length >= 3, true);
});

test("player XMPT rollback restores the transaction transform", () => {
  const animation = animationHarness();
  let transform = {
    position: [-119, 0, 79],
    facingRaw: 10,
  };
  const runtime = createNativePlayerXmptRuntime({
    getAnimation: () => animation,
    readNativeTransform: () => structuredClone(transform),
    writeNativeTransform: next => {
      transform = structuredClone(next);
      return true;
    },
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.controller().startMotion({
    actorTag: "AKIR",
    phase: "approach",
    target: [-121, 0, 79],
    facing: { kind: "target-bearing" },
    request: 0x055e,
  }), true);
  runtime.update(0.5);
  assert.notDeepEqual(transform.position, [-119, 0, 79]);
  assert.equal(runtime.rollbackTransaction(token), true);
  assert.deepEqual(transform, {
    position: [-119, 0, 79],
    facingRaw: 10,
  });
});

test("player XMPT uses exact controller placement for a pose motion", () => {
  const animation = animationHarness();
  let transform = {
    position: [-18.435373, 0.072397, 72.516792],
    facingRaw: 0,
  };
  const runtime = createNativePlayerXmptRuntime({
    getAnimation: () => animation,
    readNativeTransform: () => structuredClone(transform),
    writeNativeTransform: next => {
      transform = structuredClone(next);
      return true;
    },
  });
  const token = runtime.beginTransaction();
  const target = [-19.15, 0.0724, 72.97];
  assert.equal(runtime.controller().startMotion({
    actorTag: "AKIR",
    phase: "approach",
    target,
    facing: { kind: "target-bearing" },
    request: 594,
  }), true);
  const distance = Math.hypot(
    target[0] - -18.435373,
    target[2] - 72.516792,
  );
  const scale = (distance - 0.2) / distance;
  assert.deepEqual(transform.position, [
    Math.fround(-18.435373 + (target[0] - -18.435373) * scale),
    Math.fround(0.0724),
    Math.fround(72.516792 + (target[2] - 72.516792) * scale),
  ]);
  assert.equal(animation.requests[0].options.loop, false);
  assert.equal(runtime.controller().readMotionRequestWord({
    actorTag: "AKIR",
    phase: "approach",
  }), 594);
  animation.requests[0].options.onComplete();
  animation.activeOneShot = null;
  assert.equal(runtime.controller().readMotionRequestWord({
    actorTag: "AKIR",
    phase: "approach",
  }), 0);
  assert.equal(runtime.controller().commitTarget({
    actorTag: "AKIR",
    phase: "approach",
  }), true);
  assert.equal(runtime.commitTransaction(token), true);
});

test("player XMPT rejects motions without exact decoded metadata", () => {
  const animation = animationHarness();
  const runtime = createNativePlayerXmptRuntime({
    getAnimation: () => animation,
    readNativeTransform: () => ({
      position: [0, 0, 0],
      facingRaw: 0,
    }),
    writeNativeTransform: () => true,
  });
  runtime.beginTransaction();
  assert.equal(runtime.controller().startMotion({
    actorTag: "AKIR",
    phase: "approach",
    target: [1, 0, 0],
    facing: { kind: "target-bearing" },
    request: 999,
  }), false);
});

test("player XMPT exposes a validated native transform for authored selectors", () => {
  const animation = animationHarness();
  const runtime = createNativePlayerXmptRuntime({
    getAnimation: () => animation,
    readNativeTransform: () => ({ position: [1.25, 2.5, 3.75], facingRaw: -1 }),
    writeNativeTransform: () => true,
  });
  assert.deepEqual(runtime.currentTransform(), {
    position: [1.25, 2.5, 3.75], facingRaw: 0xffff,
  });
});
