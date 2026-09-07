import assert from "node:assert/strict";
import test from "node:test";

import {
  ScriptDebugScenarioRuntime,
} from "../play/debug/ScriptDebugScenarioRuntime.js";

test("script debug scenario sandboxes writes and restores the original world", async () => {
  const calls = [];
  const writes = [];
  const originalWorld = { id: "dobuita" };
  const scenarioWorld = { id: "dpiz", nativeArea: "DPIZ", label: "Fortune's Pier" };
  const scenario = {
    id: "fortune",
    label: "Fortune teller",
    worldId: "dpiz",
    spawn: { position: [1, 2, 3], yaw: 0.5 },
    script: { objectTag: "FORT" },
    nativeDialogueWrites: [{ bank: 1, index: 2, value: 3 }],
  };
  const runtime = new ScriptDebugScenarioRuntime({
    scenarios: [scenario],
    scenarioById: id => id === scenario.id ? scenario : null,
    worlds: { dpiz: scenarioWorld },
    worldRuntime: { activeWorld: originalWorld },
    getController: () => ({
      collider: { position: { asArray: () => [9, 8, 7] } },
    }),
    actorRoot: { rotation: { y: 1.25 } },
    dialoguePersistence: {
      beginSandbox: () => calls.push("begin"),
      endSandbox: () => calls.push("end"),
      gameplayState: () => ({
        dialogueState: {
          write: (...args) => writes.push(args),
        },
      }),
    },
    scriptEventController: { status: "idle" },
    nativeScriptedEvents: { status: "idle" },
    selectWorld: async (...args) => {
      calls.push(["select", ...args]);
      return true;
    },
    enabled: true,
  });

  assert.equal(
    await runtime.apply("fortune"),
    "Fortune teller applied. Interact with FORT.",
  );
  assert.deepEqual(writes, [[1, 2, 3]]);
  assert.equal(runtime.session.originalWorld, originalWorld);

  assert.equal(
    await runtime.reset(),
    "Original location and script state restored.",
  );
  assert.deepEqual(calls.at(-1), [
    "select",
    originalWorld,
    {
      debugSpawn: { position: [9, 8, 7], yaw: 1.25 },
      persistLocation: false,
    },
  ]);
  assert.equal(runtime.session, null);
});
