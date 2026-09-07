import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeGameplayEffectRuntime,
  createNativeActorByteEffectAdapter,
  createNativeGlobalByteEffectAdapter,
  createNativeMapLayerEffectAdapter,
  createNativeMapTransitionEffectAdapter,
  createNativeObjectRuntimeFlagEffectAdapter,
  createNativeStateBankEffectAdapter,
  materializeNativeGameplayEffect,
  validateNativeGameplayEffect,
} from "../play/events/NativeGameplayEffectRuntime.js";
import {
  createNativeDialogueState,
} from "../play/dialogue/NativeDialogueState.js";
import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  WorldMapLayerState,
} from "../src/rendering/WorldMapLayerState.js";

test("validates exact native effect shapes", () => {
  assert.equal(validateNativeGameplayEffect({
    kind: "mapTransition",
    scene: 2,
    area: "JOMO",
    entry: 0,
  }).area, "JOMO");
  assert.throws(
    () => validateNativeGameplayEffect({
      kind: "objectRuntimeFlag",
      object: "door",
      mode: 0,
    }),
    /mode must be 1 or 2/,
  );
});

test("materializes static fourcc and runtime operands without guessing", () => {
  const effect = materializeNativeGameplayEffect({
    kind: "actorByteStateWrite",
    actor: {
      kind: "constant",
      value: 0x4f544148,
      ascii: "HATO",
    },
    value: { kind: "runtime", source: "@(12,r14)" },
    source: { callOffset: "0x1234" },
  }, (operand, context) => {
    assert.equal(operand.source, "@(12,r14)");
    assert.equal(context.label, "actor byte state");
    return 3;
  });

  assert.deepEqual(effect, {
    kind: "actorByteStateWrite",
    actor: "HATO",
    value: 3,
    source: { callOffset: "0x1234" },
  });
  assert.throws(
    () => materializeNativeGameplayEffect({
      kind: "globalByteStateWrite",
      value: { kind: "runtime", source: "unknown" },
    }),
    /requires a runtime operand resolver/,
  );
});

test("applies a proven state-bank mutation", async () => {
  const state = createNativeDialogueState();
  const runtime = createNativeGameplayEffectRuntime({
    writeStateBank: createNativeStateBankEffectAdapter(state),
  });
  const result = await runtime.execute([{
    kind: "stateBankWrite",
    bank: 2,
    index: 190,
    value: 1,
  }]);
  assert.equal(result.status, "applied");
  assert.equal(state.read(2, 190), 1);
});

test("preflights every adapter before mutating state", async () => {
  const state = createNativeDialogueState();
  const runtime = createNativeGameplayEffectRuntime({
    writeStateBank: createNativeStateBankEffectAdapter(state),
  });
  await assert.rejects(
    runtime.execute([
      { kind: "stateBankWrite", bank: 2, index: 190, value: 1 },
      { kind: "mapLayerState", layer: 20, value: 0 },
    ]),
    /requires setMapLayerState/,
  );
  assert.equal(state.read(2, 190), 0);
});

test("applies and can roll back native per-actor byte state", async () => {
  const actorState = createNativeActorByteState();
  const runtime = createNativeGameplayEffectRuntime({
    writeActorByteState: createNativeActorByteEffectAdapter(actorState),
  });
  await runtime.execute([{
    kind: "actorByteStateWrite",
    actor: "HATO",
    value: 3,
  }]);
  assert.equal(actorState.read("HATO"), 3);
});

test("rolls back earlier effects when a later adapter fails", async () => {
  const state = createNativeDialogueState();
  const runtime = createNativeGameplayEffectRuntime({
    writeStateBank: createNativeStateBankEffectAdapter(state),
    setMapLayerState: {
      apply() {
        throw new Error("layer failure");
      },
    },
  });
  await assert.rejects(
    runtime.execute([
      { kind: "stateBankWrite", bank: 2, index: 190, value: 1 },
      { kind: "mapLayerState", layer: 20, value: 0 },
    ]),
    /layer failure/,
  );
  assert.equal(state.read(2, 190), 0);
});

test("applies exact numbered MAP layer state with rollback metadata", async () => {
  const layerState = new WorldMapLayerState();
  const runtime = createNativeGameplayEffectRuntime({
    setMapLayerState: createNativeMapLayerEffectAdapter(layerState),
  });

  await runtime.execute([{
    kind: "mapLayerState",
    layer: 20,
    value: 3,
  }]);

  assert.deepEqual(
    layerState.scriptState(20),
    { present: true, value: 3 },
  );
});

test("resolves native map transition before requesting travel", async () => {
  const requests = [];
  const runtime = createNativeGameplayEffectRuntime({
    requestMapTransition: createNativeMapTransitionEffectAdapter({
      resolve: effect => (
        effect.area === "JOMO" ? { id: "exact-jomo-entry" } : null
      ),
      request: transition => requests.push(transition.id),
    }),
  });
  await runtime.execute([{
    kind: "mapTransition",
    scene: 1,
    area: "JOMO",
    entry: 0,
  }]);
  assert.deepEqual(requests, ["exact-jomo-entry"]);
});

test("map transitions must be the single terminal effect", async () => {
  const state = createNativeDialogueState();
  const runtime = createNativeGameplayEffectRuntime({
    requestMapTransition: createNativeMapTransitionEffectAdapter({
      resolve: () => ({ id: "exact" }),
      request: () => {},
    }),
    writeStateBank: createNativeStateBankEffectAdapter(state),
  });
  await assert.rejects(
    runtime.execute([
      { kind: "mapTransition", scene: 1, area: "JOMO", entry: 0 },
      { kind: "stateBankWrite", bank: 2, index: 1, value: 1 },
    ]),
    /single terminal effect/,
  );
  assert.equal(state.read(2, 1), 0);
});

test("applies exact scene byte and object runtime flags", async () => {
  const sceneState = createNativeSceneGameplayState();
  const runtime = createNativeGameplayEffectRuntime({
    writeGlobalByteState: createNativeGlobalByteEffectAdapter(sceneState),
    setObjectRuntimeFlag: (
      createNativeObjectRuntimeFlagEffectAdapter(sceneState)
    ),
  });

  await runtime.execute([
    { kind: "globalByteStateWrite", value: 17 },
    { kind: "objectRuntimeFlag", object: "dor0", mode: 1 },
  ]);

  assert.equal(sceneState.readGlobalByte(), 17);
  assert.equal(sceneState.readObjectRuntimeFlag("dor0"), true);
});
