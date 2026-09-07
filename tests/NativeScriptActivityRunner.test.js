import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeScriptActivityRunner,
  nativeFailureDetail,
} from "../play/scripts/NativeScriptActivityRunner.js";
import {
  createNativeSelectedObjectActionController,
} from "../play/scripts/NativeSelectedObjectActionController.js";

function harness() {
  const calls = [];
  const listeners = new Set();
  const restoredStates = [];
  const runtime = {
    startObjectInteraction: async detail => {
      calls.push(["start", detail]);
      return { status: "yielded" };
    },
    onSettled: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancel: reason => {
      calls.push(["cancel", reason]);
      for (const listener of [...listeners]) {
        listener({ kind: "cancelled", result: { status: "cancelled", reason } });
      }
      return true;
    },
  };
  return {
    calls,
    runtime,
    runner: createNativeScriptActivityRunner({
      nativeRuntime: runtime,
      getArea: () => "D000",
      captureClientState: () => ({ revision: 7 }),
      restoreClientState: state => restoredStates.push(state),
    }),
    settle: (kind, result = {}) => {
      for (const listener of [...listeners]) listener({ kind, result });
    },
    listenerCount: () => listeners.size,
    restoredStates,
  };
}

const activity = Object.freeze({
  kind: "native-object-interaction",
  area: "D000",
  objectTag: "TBK1",
  action: 1,
  durableEffects: "forbidden",
});
const context = Object.freeze({
  area: "D000",
  objectTag: "TBK1",
  sceneObject: { objectTag: "TBK1" },
  nativeContext: { exact: true },
});

test("headless replay formats the recent TBK1 failure exactly", () => {
  assert.equal(nativeFailureDetail({
    status: "stopped",
    reason: {
      kind: "scripted-event-interpreter-stopped",
      result: {
        status: "stopped",
        reason: {
          kind: "operation-stopped",
          semanticId: "tagged-object-action",
          detail: "selected native object action cannot be finalized",
        },
      },
    },
  }), "scripted-event-interpreter-stopped -> operation-stopped -> semantic tagged-object-action -> selected native object action cannot be finalized");
});

test("runs one catalogued native object activity through settlement", async () => {
  const h = harness();
  const result = h.runner.start(activity, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls[0], ["start", {
    area: "D000",
    objectTag: "TBK1",
    sceneObject: context.sceneObject,
    context: {
      selectedObjectTag: "TBK1",
      selectedObjectAction: 1,
      exact: true,
    },
  }]);
  h.settle("completed", { status: "completed" });
  assert.equal(await result, true);
  assert.deepEqual(h.restoredStates, [{ revision: 7 }]);
  assert.equal(h.listenerCount(), 0);
});

test("cancellation owns and rejects the active native activity", async () => {
  const h = harness();
  const result = h.runner.start(activity, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.runner.cancel("world-change"), true);
  assert.equal(await result, false);
  assert.deepEqual(h.restoredStates, [{ revision: 7 }]);
  assert.deepEqual(h.calls.at(-1), ["cancel", "world-change"]);
  assert.equal(h.listenerCount(), 0);
});

test("preserves the exact native stop reason instead of reducing it to false", async () => {
  const listeners = new Set();
  const runner = createNativeScriptActivityRunner({
    nativeRuntime: {
      startObjectInteraction: async () => ({
        status: "stopped",
        reason: {
          kind: "scripted-event-interpreter-stopped",
          result: {
            status: "stopped",
            reason: {
              kind: "operation-stopped",
              semanticId: "global-controller-event-word",
              detail: "global controller event queue is unavailable",
            },
          },
        },
      }),
      onSettled: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      cancel: () => false,
    },
    getArea: () => "D000",
    captureClientState: () => null,
    restoreClientState: () => {},
  });

  await assert.rejects(
    runner.start(activity, context),
    /scripted-event-interpreter-stopped -> operation-stopped -> semantic global-controller-event-word -> global controller event queue is unavailable/,
  );
  assert.equal(listeners.size, 0);
});

test("rejects mismatched area and selected object without starting native code", async () => {
  const h = harness();
  await assert.rejects(
    h.runner.start(activity, { ...context, objectTag: "TBK3" }),
    /selected object TBK1/,
  );
  assert.deepEqual(h.calls, []);
});

test("restores an explicitly empty client state after a presentation-only activity", async () => {
  const listeners = new Set();
  const restored = [];
  const runner = createNativeScriptActivityRunner({
    nativeRuntime: {
      startObjectInteraction: async () => ({ status: "yielded" }),
      onSettled: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      cancel: () => false,
    },
    getArea: () => "D000",
    captureClientState: () => null,
    restoreClientState: state => restored.push(state),
  });
  const running = runner.start(activity, context);
  await new Promise(resolve => setImmediate(resolve));
  for (const listener of [...listeners]) {
    listener({ kind: "completed", result: { status: "completed" } });
  }

  assert.equal(await running, true);
  assert.deepEqual(restored, [null]);
});

test("owns the exact selected-object handshake for the native activity lifetime", async () => {
  const calls = [];
  const listeners = new Set();
  const selectedObjectActionController =
    createNativeSelectedObjectActionController();
  const runner = createNativeScriptActivityRunner({
    nativeRuntime: {
      startObjectInteraction: async () => {
        calls.push(selectedObjectActionController.execute({
          mode: 1,
          objectTag: "TBK1",
        }));
        calls.push(selectedObjectActionController.execute({
          mode: 4,
          state: {
            objectTag: "TBK1", nativeState: 1, completed: false,
          },
        }));
        calls.push(selectedObjectActionController.execute({
          mode: 5,
          state: {
            objectTag: "TBK1", nativeState: 1, completed: true,
          },
        }));
        calls.push(selectedObjectActionController.execute({
          mode: 2,
          state: {
            objectTag: "TBK1", nativeState: 1, completed: true,
          },
        }));
        calls.push(selectedObjectActionController.execute({
          mode: 4,
          state: {
            objectTag: "TBK1", nativeState: 2, completed: false,
          },
        }));
        return { status: "completed" };
      },
      onSettled: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      cancel: () => false,
    },
    getArea: () => "D000",
    captureClientState: () => null,
    restoreClientState: () => {},
    selectedObjectActionController,
  });

  assert.equal(await runner.start(activity, context), true);
  assert.deepEqual(calls, [0, 1, 0, 0, 1]);
  assert.equal(selectedObjectActionController.active, null);
  assert.throws(
    () => selectedObjectActionController.execute({ mode: 1, objectTag: "TBK1" }),
    /no activity owner/,
  );
});

test("selected-object ownership rejects a different native object tag", () => {
  const controller = createNativeSelectedObjectActionController();
  const token = controller.claim({
    area: "D000",
    objectTag: "TBK1",
    action: 1,
    sceneObject: context.sceneObject,
  });
  assert.throws(
    () => controller.execute({ mode: 1, objectTag: "TBK3" }),
    /does not match the selected object/,
  );
  assert.equal(controller.release(token), true);
});
