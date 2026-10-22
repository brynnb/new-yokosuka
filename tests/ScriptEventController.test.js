import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptEventController,
} from "../play/scripts/ScriptEventController.js";
import { createNativeDialoguePersistence } from "../play/dialogue/NativeDialoguePersistence.js";
import { createNativeDialogueSnapshot } from "../play/dialogue/NativeDialogueSnapshot.js";

function harness(overrides = {}) {
  let nextId = 0;
  const sent = [];
  const presentationCalls = [];
  const dialogueCalls = [];
  const errors = [];
  const scriptStarts = [];
  const client = {
    startScriptEvent(selector, requestId) {
      sent.push({ type: "start", selector, requestId });
      return true;
    },
    advanceScriptEvent(runId, action, options) {
      sent.push({ type: "advance", runId, action, ...options });
      return true;
    },
  };
  const presentation = {
    begin: context => presentationCalls.push(["begin", context]) > 0,
    execute: event => presentationCalls.push(["execute", event]) > 0,
    update: delta => presentationCalls.push(["update", delta]) > 0,
    commit: () => presentationCalls.push(["commit"]) > 0,
    rollback: reason => presentationCalls.push(["rollback", reason]) > 0,
  };
  const dialogue = {
    show: (line, event) => dialogueCalls.push(["show", line, event]),
    showOptions: (options, event) => dialogueCalls.push(["options", options, event]),
    hide: () => dialogueCalls.push(["hide"]),
  };
  const controller = createScriptEventController({
    client,
    presentation,
    dialogue,
    createRequestId: () => `request-${++nextId}`,
    onStarted: identity => scriptStarts.push(identity),
    onError: error => errors.push(error),
    ...overrides,
  });
  return {
    controller, sent, presentation, presentationCalls, dialogueCalls, errors,
    scriptStarts,
  };
}

test("client combat reports once per pending request and consecutive attempts release old presentation", async () => {
  const h=harness(),calls=[],token="a".repeat(32),next="b".repeat(32);
  h.presentation.showCombat=async view=>{calls.push(view.token);return true;};
  h.presentation.endCombat=()=>calls.push("end");
  const started=h.controller.start({kind:"activity",activity:"fight"});
  await h.controller.handleYield(yieldMessage("request-1",{type:"combat"},{combat:{id:"first",token,ready:true}}));
  await started;
  assert.equal(h.controller.combatResponse("combat_result",token,{outcome:"success"}),true);
  assert.equal(h.controller.combatResponse("combat_result",token,{outcome:"success"}),false);
  await h.controller.handleYield(yieldMessage("request-2",{type:"combat"},{combat:{id:"second",token:next,ready:false}}));
  assert.deepEqual(calls,[token,"end",next]);
  assert.equal(h.controller.combatResponse("combat_result",token,{outcome:"success"}),false);
  assert.deepEqual(h.errors,[]);
  h.controller.reset();
});

test("training shares combat ownership, reports one result and releases cast before retry", async () => {
  const h=harness(),calls=[],token="a".repeat(32),next="b".repeat(32);
  h.presentation.showCombat=async view=>{calls.push(view.token);return true;};
  h.presentation.endCombat=()=>calls.push("end");
  const started=h.controller.start({kind:"activity",activity:"lesson"});
  await h.controller.handleYield(yieldMessage("request-1",{type:"challenge"},{challenge:{id:"lesson",kind:"training",token,ready:true}}));
  await started;
  assert.equal(h.controller.challengeResponse("challenge_result",token,"success"),true);
  assert.equal(h.sent.at(-1).challengeOutcome,"success");assert.equal(h.sent.at(-1).button,undefined);
  assert.equal(h.controller.challengeResponse("challenge_result",token,"success"),false);
  await h.controller.handleYield(yieldMessage("request-2",{type:"challenge"},{challenge:{id:"lesson",kind:"training",token:next,ready:false}}));
  assert.deepEqual(calls,[token,"end",next]);
  assert.equal(h.controller.challengeResponse("challenge_result",token,"success"),false);
  h.controller.challengeResponse("challenge_ready",next);
  await h.controller.handleYield(yieldMessage("request-3",{type:"line"},{line:{text:"Good work"}}));
  assert.equal(calls.at(-1),"end");assert.equal(h.controller.active.challengePrompt,null);
  assert.deepEqual(h.errors,[]);h.controller.reset();
});

test("server state ownership is prepared before dispatch and released after presentation cleanup", async () => {
  const order = [];
  let ready;
  const h = harness({prepareStart: () => new Promise(resolve => { ready = () => resolve(() => order.push("release")); })});
  const started = h.controller.start({kind:"talk", actor:"INE_"});
  assert.equal(h.sent.length, 0);
  assert.equal(h.controller.status, "starting");
  ready();
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.handleYield(yieldMessage("request-1", {type:"line"}, {line:{text:"Hello"}}));
  await started;
  let ended=false;
  const runEnded=h.controller.waitForRunEnd(h.controller.active.runId).then(()=>{ended=true;});
  await Promise.resolve();assert.equal(ended,false);
  h.presentation.commit = () => order.push("cleanup");
  h.controller.advanceLine();
  await h.controller.handleYield(yieldMessage("request-2", {type:"complete"}));
  await runEnded;assert.equal(ended,true);
  assert.deepEqual(order, ["cleanup", "release"]);
});

test("cancel during preparation does not dispatch and releases only its own ownership", async () => {
  let ready, released = 0;
  const h = harness({prepareStart: () => new Promise(resolve => {ready = () => resolve(() => released++);})});
  const started = h.controller.start({kind:"talk", actor:"INE_"});
  const rejected = assert.rejects(started, error => error.code === "start_cancelled");
  h.controller.cancel();
  ready();
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(released, 1);
  assert.equal(h.sent.length, 0);
});

test("late start after cancellation is cancelled on the server instead of orphaning its lease", async () => {
  const h = harness();
  const started = h.controller.start({kind:"talk", actor:"INE_"});
  const rejected = assert.rejects(started, error => error.code === "start_cancelled");
  h.controller.cancel();
  await rejected;
  await h.controller.handleYield(yieldMessage("request-1", {type:"line"}, {line:{text:"Late"}}));
  assert.equal(h.sent.at(-1).action, "cancel");
  assert.equal(h.controller.status, "idle");
  assert.deepEqual(h.presentationCalls, []);
});

test("a missing reply times out without authorizing native fallback and accepts a safe retry", async () => {
  let released = 0;
  const h = harness({requestTimeoutMs:10, prepareStart: async () => () => released++});
  const started = h.controller.start({kind:"talk", actor:"INE_"});
  const rejected = assert.rejects(started, error => error.code === "script_timeout");
  await new Promise(resolve => setTimeout(resolve,25));
  await rejected;
  assert.equal(released, 1);
  assert.equal(h.controller.status, "idle");
  const next = h.controller.start({kind:"talk", actor:"INE_"});
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.handleYield(yieldMessage("request-2", {type:"complete"}));
  assert.equal((await next).outcome, "complete");
});

test("a stalled pre-event save times out, releases ownership and never dispatches late", async () => {
  let acknowledge;
  const persistence = createNativeDialoguePersistence({ saveSnapshot: snapshot => new Promise(resolve => {
    acknowledge = () => resolve({ ...snapshot, revision: snapshot.revision + 1 });
  }) });
  persistence.hydrate(null).dialogueState.write(2, 900, 1);
  persistence.markDirty();
  const h = harness({ requestTimeoutMs: 10, prepareStart: options => persistence.beginServerEvent(options) });
  const started = h.controller.start({ kind: "talk", actor: "INE_" });
  const rejected = assert.rejects(started, error => error.code === "script_timeout");
  await new Promise(resolve => setTimeout(resolve, 25));
  await rejected;
  assert.equal(h.controller.status, "idle");
  assert.equal(persistence.serverEvent, null);
  acknowledge();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sent.length, 0);
  assert.equal(persistence.snapshot.revision, 1, "the earlier save is still durable");
});

test("committed gate state survives presentation failure and old activity cleanup", async () => {
  const persistence = createNativeDialoguePersistence({ saveSnapshot: async () => assert.fail("unexpected save") });
  const baseline = persistence.hydrate(null).toJSON();
  const h = harness({ prepareStart: options => persistence.beginServerEvent(options) });
  const started = h.controller.start({ kind: "talk", actor: "INE_" });
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.handleYield(yieldMessage("request-1", { type: "line" }, { line: { text: "Hello" } }));
  await started;
  const saved = createNativeDialogueSnapshot(baseline);
  saved.revision = 1;
  saved.dialogueState.write(2, 832, 1);
  persistence.acceptServerSnapshot(saved.toJSON());
  h.presentation.rollback = () => persistence.restoreWorkingState(baseline);
  await h.controller.fail(new Error("next presentation failed"));
  assert.deepEqual(persistence.captureWorkingState(), saved.toJSON());
  assert.equal(h.controller.status, "idle");
  assert.equal(h.sent.at(-1).action, "cancel");
});

test("visual rollback failure still releases ownership and cancels the server run", async t => {
  t.mock.method(console, "error", () => {});
  let released = 0;
  const h = harness({ prepareStart: async () => () => released++ });
  const started = h.controller.start({ kind: "talk", actor: "INE_" });
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.handleYield(yieldMessage("request-1", { type: "line" }, { line: { text: "Hello" } }));
  await started;
  h.presentation.rollback = () => { throw new Error("broken visual cleanup"); };
  h.controller.cancel();
  assert.equal(h.sent.at(-1).action, "cancel");
  await h.controller.handleYield(yieldMessage("request-2", { type: "cancelled" }));
  assert.equal(released, 1);
  assert.equal(h.controller.status, "idle");
});

function yieldMessage(requestId, event, extra = {}) {
  return { requestId, runId: 41, event, ...extra };
}

test("controller serializes command acknowledgements and line advancement", async () => {
  const h = harness();
  const started = h.controller.start(
    { kind: "talk", actor: "HATO" },
    { area: "D000", actorCode: "HATO", actorInstanceId: "hato-1" },
  );
  await h.controller.handleYield(yieldMessage("request-1", {
    type: "command", name: "start_camera", sequence: 1,
  }));
  assert.equal((await started).outcome, "started");
  assert.deepEqual(h.sent.at(-1), {
    type: "advance", runId: 41, action: "continue", requestId: "request-2",
  });
  await h.controller.handleYield(yieldMessage("request-2", {
    type: "line", lineId: "line:1", sequence: 2,
  }, { line: { id: "line:1", text: "Hato: Hello" } }));
  assert.equal(h.controller.status, "line");
  assert.equal(h.controller.advanceLine(), true);
  assert.equal(h.sent.at(-1).requestId, "request-3");
  await h.controller.handleYield(yieldMessage("request-3", {
    type: "complete", sequence: 3,
  }));
  assert.equal(h.controller.status, "idle");
  assert.deepEqual(h.presentationCalls.map(([name]) => name), [
    "begin", "execute", "commit",
  ]);
});

test("controller reports the authoritative database script identity once", async () => {
  const h = harness();
  const selector = { kind: "use", object: "TBK1" };
  const context = { area: "D000", objectTag: "TBK1" };
  const started = h.controller.start(selector, context);
  await h.controller.handleYield(yieldMessage("request-1", {
    type: "line", lineId: "line:phone", sequence: 1,
  }, {
    scriptId: 17,
    versionId: 23,
    scriptSlug: "dobuita-phone-book",
    line: { id: "line:phone", text: "Phone book" },
  }));
  await started;
  assert.deepEqual(h.scriptStarts, [{
    kind: "database",
    runId: 41,
    scriptId: 17,
    versionId: 23,
    scriptSlug: "dobuita-phone-book",
    selector,
    context,
  }]);
});

test("controller presents compiled Yarn choices and selects only available IDs", async () => {
  const h = harness();
  const started = h.controller.start({ kind: "talk", actor: "HATO" });
  const options = [
    { id: 2, isAvailable: true, line: { id: "line:yes", text: "Ask again" } },
    { id: 7, isAvailable: false, line: { id: "line:no", text: "Unavailable" } },
  ];
  await h.controller.handleYield(yieldMessage("request-1", {
    type: "options", sequence: 1,
  }, { options }));
  await started;
  assert.equal(h.controller.status, "options");
  assert.equal(h.controller.selectOption(7), false);
  assert.equal(h.controller.selectOption(2), true);
  assert.deepEqual(h.sent.at(-1), {
    type: "advance", runId: 41, action: "select",
    requestId: "request-2", optionId: 2,
  });
});

test("no-script rejection is an explicit start result for native fallback", async () => {
  const h = harness();
  const started = h.controller.start({ kind: "talk", actor: "FUKU" });
  assert.equal(h.controller.handleRejected({
    requestId: "request-1",
    code: "no_script",
    message: "No published script matches this interaction.",
  }), true);
  const result = await started;
  assert.equal(result.outcome, "rejected");
  assert.equal(result.error.code, "no_script");
  assert.equal(h.controller.status, "idle");
});

test("an unavailable connection is distinguishable from an interrupted start", async () => {
  const disconnected = harness();
  disconnected.controller.client.startScriptEvent = () => false;
  await assert.rejects(
    disconnected.controller.start({ kind: "use", object: "TBK1" }),
    error => error.code === "connection_unavailable",
  );

  const interrupted = harness();
  const started = interrupted.controller.start({ kind: "use", object: "TBK1" });
  interrupted.controller.reset("world-change");
  await assert.rejects(started, error => error.code === "start_interrupted");
});

test("presentation failure rolls back and cancels authoritative run", async () => {
  const h = harness();
  h.controller.presentation.execute = async () => {
    throw new Error("unresolved native presentation steps");
  };
  const started = h.controller.start({ kind: "automatic" }, { area: "JOMO" });
  await h.controller.handleYield(yieldMessage("request-1", {
    type: "command", name: "play_sequence", sequence: 1,
  }));
  await started;
  assert.equal(h.controller.status, "idle");
  assert.deepEqual(h.presentationCalls.map(([name]) => name), [
    "begin", "rollback",
  ]);
  assert.equal(h.sent.at(-1).action, "cancel");
  assert.match(h.errors[0].message, /unresolved native/);
});

test("frame update failure immediately rolls back and cancels the authoritative run", async () => {
  const h = harness();
  h.controller.presentation.update = () => false;
  const started = h.controller.start({ kind: "automatic" }, { area: "JOMO" });
  await h.controller.handleYield(yieldMessage("request-1", {
    type: "line", lineId: "line:telephone", sequence: 1,
  }, { line: { id: "line:telephone", text: "Goro: Hey Bro!" } }));
  await started;

  assert.equal(h.controller.status, "line");
  assert.equal(h.controller.update(1 / 30), false);
  assert.equal(h.controller.status, "idle");
  assert.deepEqual(h.presentationCalls.map(([name]) => name), [
    "begin", "rollback",
  ]);
  assert.equal(h.sent.at(-1).action, "cancel");
  assert.match(h.errors[0].message, /frame update was rejected/);
});

test("cancel rolls back immediately and waits for the server terminal yield", async () => {
  const h = harness();
  const started = h.controller.start({ kind: "talk", actor: "HATO" }, {
    area: "D000",
  });
  await h.controller.handleYield(yieldMessage("request-1", {
    type: "line", lineId: "line:1", sequence: 1,
  }, { line: { id: "line:1", text: "Hato: Hello" } }));
  await started;
  assert.equal(h.controller.cancel(), true);
  assert.equal(h.sent.at(-1).action, "cancel");
  await h.controller.handleYield(yieldMessage("request-2", {
    type: "cancelled", sequence: 2,
  }));
  assert.equal(h.controller.status, "idle");
  assert.deepEqual(h.presentationCalls.map(([name]) => name), [
    "begin", "rollback",
  ]);
});

test("cancel during an async activity suppresses stale failure and duplicate cancel", async () => {
  const h = harness();
  let rejectActivity;
  h.presentation.execute = () => new Promise((resolve, reject) => {
    rejectActivity = reject;
  });
  const started = h.controller.start({ kind: "use", object: "TBK1" }, {
    area: "D000", objectTag: "TBK1",
  });
  const processing = h.controller.handleYield(yieldMessage("request-1", {
    type: "command", name: "start_activity", sequence: 1,
  }));
  await started;

  assert.equal(h.controller.cancel("world-change"), true);
  assert.equal(h.controller.status, "cancelling");
  rejectActivity(new Error("activity d000.telephone-book.native was rejected"));
  assert.equal(await processing, false);
  assert.equal(h.errors.length, 0);
  assert.equal(h.sent.filter(message => message.action === "cancel").length, 1);

  await h.controller.handleYield(yieldMessage("request-2", {
    type: "cancelled", sequence: 2,
  }));
  assert.equal(h.controller.status, "idle");
});

test("early close processes the cancellation reply without waiting for a pending voice and permits the next conversation", async () => {
  const h = harness();
  let resolveVoice;
  h.controller.dialogue.show = () => new Promise(resolve => { resolveVoice = resolve; });
  const started = h.controller.start({ kind: "talk", actor: "HATO" });
  const line = h.controller.handleYield(yieldMessage("request-1", {
    type: "line", sequence: 1,
  }, { line: { text: "Hato: Hello" } }));
  await started;
  h.controller.cancel();
  const cancelled = h.controller.handleYield(yieldMessage("request-2", { type: "cancelled" }));
  await new Promise(resolve => setImmediate(resolve));
  const statusAfterReply = h.controller.status;
  // Always release the fixture, including on the pre-fix failing path.
  resolveVoice();
  await Promise.all([line, cancelled]);
  assert.equal(statusAfterReply, "idle", "a closed voice load must not block the server terminal reply");
  const next = h.controller.start({ kind: "talk", actor: "SMTH" });
  await h.controller.handleYield(yieldMessage("request-3", { type: "complete" }));
  assert.equal((await next).outcome, "complete");
  assert.equal(h.controller.status, "idle");
});

test("world interruption unblocks the next session and ignores the old presentation's late failure", async () => {
  const h = harness();
  let rejectVoice;
  h.controller.dialogue.show = () => new Promise((_, reject) => { rejectVoice = reject; });
  const started = h.controller.start({ kind: "talk", actor: "HATO" });
  const line = h.controller.handleYield(yieldMessage("request-1", { type: "line" }, { line: { text: "Hato: Hello" } }));
  await started;
  h.controller.reset("world-change");
  const next = h.controller.start({ kind: "talk", actor: "SMTH" });
  h.controller.dialogue.show = () => true;
  await h.controller.handleYield(yieldMessage("request-2", { type: "line" }, { line: { text: "Smith: Hello" } }));
  await next;
  rejectVoice(new Error("old voice failed after teardown"));
  await line;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.controller.status, "line");
  assert.equal(h.controller.active.requestId, "request-2");
  assert.deepEqual(h.errors, []);
});
