import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptAutomaticEventRuntime,
  nativeAutomaticGateInputUnavailable,
} from "../play/scripts/ScriptAutomaticEventRuntime.js";

function deferred() {
  let resolve;
  const promise = new Promise(resolve_ => { resolve = resolve_; });
  return { promise, resolve };
}

function harness(start = async () => ({ outcome: "declined" })) {
  const starts = [];
  const native = [];
  const errors = [];
  const controller = {
    status: "idle",
    start(selector, context) {
      starts.push({ selector, context });
      return start(selector, context);
    },
  };
  const runtime = createScriptAutomaticEventRuntime({
    controller,
    pollNative: detail => (native.push(detail), Promise.resolve()),
    onError: error => errors.push(error),
  });
  return { runtime, controller, starts, native, errors };
}

test("automatic server scripts own one dispatch per room residency", async () => {
  const h = harness();
  assert.equal(h.runtime.update({ area: "JOMO", context: { marker: 1 } }), true);
  await h.runtime.pending;
  assert.deepEqual(h.starts, [{
    selector: { kind: "automatic" },
    context: { marker: 1, area: "JOMO" },
  }]);
  assert.equal(h.native.length, 0);
  assert.equal(h.runtime.update({ area: "JOMO" }), false);

  h.runtime.leaveArea();
  assert.equal(h.runtime.update({ area: "JOMO" }), true);
  await h.runtime.pending;
  assert.equal(h.starts.length, 2);
});

test("native automatic events run only after an explicit server absence", async () => {
  const missing = harness(async () => ({
    outcome: "rejected",
    error: Object.assign(new Error("missing"), { code: "no_script" }),
  }));
  missing.runtime.update({ area: "D000" });
  await missing.runtime.pending;
  assert.equal(missing.native.length, 1);
  assert.equal(missing.native[0].reason, "no_script");

  const rejected = harness(async () => ({
    outcome: "rejected",
    error: Object.assign(new Error("conflict"), { code: "ambiguous_trigger" }),
  }));
  rejected.runtime.update({ area: "D000" });
  await rejected.runtime.pending;
  assert.equal(rejected.native.length, 0);
  assert.equal(rejected.errors[0].code, "ambiguous_trigger");
});

test("a disconnected server delegates the room-entry dispatch to native", async () => {
  const error = Object.assign(new Error("offline"), {
    code: "connection_unavailable",
  });
  const h = harness(async () => { throw error; });
  h.runtime.update({ area: "JOMO" });
  await h.runtime.pending;
  assert.equal(h.native.length, 1);
  assert.equal(h.native[0].reason, "connection_unavailable");
  assert.equal(h.errors.length, 0);
});

test("an old room response cannot launch a native event in the new room", async () => {
  const start = deferred();
  const h = harness(() => start.promise);
  h.runtime.update({ area: "JOMO" });
  h.runtime.leaveArea();
  h.runtime.enterArea("D000");
  start.resolve({
    outcome: "rejected",
    error: Object.assign(new Error("missing"), { code: "no_script" }),
  });
  await start.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.native.length, 0);
});

test("only a structurally unresolved native gate is unavailable input", () => {
  assert.equal(nativeAutomaticGateInputUnavailable({
    status: "stopped",
    reason: {
      kind: "automatic-event-gate-stopped",
      result: {
        status: "stopped",
        reason: {
          kind: "unresolved-branch-predicate",
          branchFileOffset: "0x77f32",
          detail: "call-result-expression-scene-field:248",
        },
      },
    },
  }), true);
  assert.equal(nativeAutomaticGateInputUnavailable({
    status: "stopped",
    reason: {
      kind: "automatic-event-gate-stopped",
      result: {
        status: "stopped",
        reason: { kind: "operation-stopped" },
      },
    },
  }), false);
});
