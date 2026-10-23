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

test("AUTH receiver cues follow accepted frames, handovers, seeks and cancellation", () => {
  const {calls,runtime}=harness(),owner={};
  const left={bindingIndex:3},right={bindingIndex:4};
  const activity={nativeTelephoneCues:[{frame:160,action:"attach",receiver:left},
    {frame:521,action:"attach",receiver:right},{frame:1135,action:"detach"}]};
  assert.equal(runtime.beginActivity(activity,owner),true);
  assert.equal(runtime.setFrame(owner,159),true); assert.deepEqual(calls,[]);
  for(const frame of [160,520,521,700,100,700,1135])assert.equal(runtime.setFrame(owner,frame),true);
  assert.deepEqual(calls.filter(c=>c[0]!=="update").map(c=>c.slice(0,2)),[
    ["attach",3],["detach",3],["attach",4],["detach",4],["attach",4],["detach",4],
  ]);
  assert.equal(runtime.setFrame({},600),false);
  assert.equal(runtime.setFrame(owner,-1),false);
  assert.equal(runtime.setFrame(owner,600),true);
  assert.equal(runtime.beginActivity(activity,{}),false);
  assert.equal(runtime.cancel(owner),true);
  assert.equal(runtime.active,null);
  assert.equal(runtime.beginActivity(activity,owner),true);
  assert.equal(runtime.setFrame(owner,600),true);
  assert.equal(runtime.beginActivity({},owner),true);
  assert.equal(runtime.active,null);
});

test("AUTH failure releases the borrowed handset instead of continuing a broken scene", () => {
  const {runtime,calls}=harness(),owner={};
  const activity={nativeTelephoneCues:[{frame:5,action:"attach",receiver:{bindingIndex:3}}]};
  runtime.beginActivity(activity,owner);
  runtime.updateReceiver=()=>false;
  assert.equal(runtime.setFrame(owner,5),false);
  assert.equal(runtime.active,null);
  assert.equal(calls.at(-1)[0],"detach");
  runtime.attachReceiver=()=>false;
  runtime.beginActivity(activity,owner);
  assert.equal(runtime.setFrame(owner,5),false);
  assert.equal(runtime.active,null);
});

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
