import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptEventPresentationCatalog,
} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {
  createTelephonePresentationRuntime,
} from "../play/scripts/TelephonePresentationRuntime.js";

function harness() {
  const calls = [];
  const runtime = createTelephonePresentationRuntime({
    playSound: (cue, owner) => (
      calls.push(["sound", cue.commandHex, owner]), true
    ),
    attachReceiver: (receiver, owner) => (
      calls.push(["attach", receiver.bindingIndex, owner]), true
    ),
    updateReceiver: (receiver, owner) => (
      calls.push(["update", receiver.bindingIndex, owner]), true
    ),
    detachReceiver: (receiver, owner) => (
      calls.push(["detach", receiver.bindingIndex, owner]), true
    ),
  });
  return { calls, runtime };
}

test("telephone ring preserves the exact two-cue 90-tick timeline", async () => {
  const { calls, runtime } = harness();
  const sequence = createScriptEventPresentationCatalog().sequence(
    "jomo.telephone.ring.sa1093",
  );
  const owner = { id: "event" };
  const ringing = runtime.play(sequence, owner);

  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ["sound", "a9056500"],
  ]);
  runtime.update(owner, 89 / 30);
  assert.equal(calls.length, 1);
  runtime.update(owner, 1 / 30);
  assert.equal(await ringing, true);
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ["sound", "a9056500"],
    ["sound", "a9056500"],
  ]);
  assert.equal(runtime.assertSettled(owner), true);
});

test("answer and hang-up helpers advance concurrently with dialogue", async () => {
  const { calls, runtime } = harness();
  const catalog = createScriptEventPresentationCatalog();
  const start = catalog.sequence("jomo.telephone.answer.sa1093.first");
  const finish = catalog.sequence("jomo.telephone.hangup.sa1093.first");
  const owner = { id: "event" };

  const leadIn = runtime.play(start, owner);
  assert.deepEqual(calls, []);
  runtime.update(owner, 122 / 30);
  assert.equal(calls.length, 0);
  runtime.update(owner, 1 / 30);
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ["sound", "ab060000"],
    ["attach", 3],
    ["update", 3],
  ]);

  runtime.update(owner, 27 / 30);
  assert.equal(await leadIn, true);

  // Yarn can reach its hang-up command while the independently scheduled
  // native helper is still waiting. The command joins rather than restarting it.
  runtime.update(owner, 50 / 30);
  const hangingUp = runtime.play(finish, owner);
  runtime.update(owner, 704 / 30);
  assert.equal(await hangingUp, true);
  assert.deepEqual(calls.map(call => call.slice(0, 2)).filter(
    ([name]) => name !== "update",
  ), [
    ["sound", "ab060000"],
    ["attach", 3],
    ["sound", "ab060100"],
    ["detach", 3],
  ]);
  assert.equal(runtime.assertSettled(owner), true);
});

test("a late authored hang-up joins an already completed native helper", async () => {
  const { calls, runtime } = harness();
  const catalog = createScriptEventPresentationCatalog();
  const start = catalog.sequence("jomo.telephone.answer.sa1093.later");
  const finish = catalog.sequence("jomo.telephone.hangup.sa1093.later");
  const owner = { id: "event" };

  const leadIn = runtime.play(start, owner);
  runtime.update(owner, 850 / 30);
  assert.equal(await leadIn, true);
  assert.equal(runtime.play(finish, owner), true);
  assert.deepEqual(calls.map(call => call.slice(0, 2)).filter(
    ([name]) => name !== "update",
  ), [
    ["sound", "ab060000"],
    ["attach", 3],
    ["sound", "ab060100"],
    ["detach", 3],
  ]);
});

test("cancellation releases an attached receiver and all waiters", async () => {
  const { calls, runtime } = harness();
  const sequence = createScriptEventPresentationCatalog().sequence(
    "jomo.telephone.answer.sa1093.first",
  );
  const owner = { id: "event" };
  const leadIn = runtime.play(sequence, owner);
  runtime.update(owner, 123 / 30);

  assert.equal(runtime.cancel(owner), true);
  assert.equal(await leadIn, false);
  assert.deepEqual(calls.at(-1).slice(0, 2), ["detach", 3]);
  assert.equal(runtime.assertSettled(owner), true);
});
