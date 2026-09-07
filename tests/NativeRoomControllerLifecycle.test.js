import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeRoomControllerLifecycle,
} from "../play/events/NativeRoomControllerLifecycle.js";

const controller = {
  id: "room-owner",
  entryFunction: "0x100",
  dispatches: [{ eventCodes: ["TBK1"], targetFunction: "0x200" }],
  maintenance: { countdownCallFileOffset: "0x180" },
};

test("prepares an exact owner dispatch and retains its idle checkpoint", () => {
  const lifecycle = createNativeRoomControllerLifecycle();
  const selected = {
    roomController: controller,
    interaction: { objectTag: "TBK1", entryFunction: "0x200" },
  };
  const first = lifecycle.prepare(selected);
  assert.equal(first.entryFunction, "0x100");
  assert.equal(first.eventWord, 0x314b4254);
  assert.equal(first.interpreterState, null);

  lifecycle.commit(first, { steps: 88, frames: [{ functionId: "0x100" }] });
  assert.deepEqual(lifecycle.prepare(selected).interpreterState, {
    steps: 0,
    frames: [{ functionId: "0x100" }],
  });
});

test("recognizes only the owner's exact authored maintenance yield", () => {
  const lifecycle = createNativeRoomControllerLifecycle();
  const execution = lifecycle.prepare({
    roomController: controller,
    interaction: { objectTag: "TBK1", entryFunction: "0x200" },
  });
  const result = {
    status: "yielded",
    location: { functionId: "0x100" },
    request: {
      kind: "native-coroutine-continuation",
      scheduler: {
        kind: "native-scheduler-countdown",
        callFileOffset: "0x180",
      },
    },
  };
  assert.equal(lifecycle.isInteractionBoundary(execution, result), true);
  assert.equal(lifecycle.isInteractionBoundary(execution, {
    ...result,
    location: { functionId: "0x200" },
  }), false);
});

test("fails closed when controller metadata does not own the child", () => {
  const lifecycle = createNativeRoomControllerLifecycle();
  assert.throws(() => lifecycle.prepare({
    roomController: controller,
    interaction: { objectTag: "TBK1", entryFunction: "0x999" },
  }), /not exact/);
});
