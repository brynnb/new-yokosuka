import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptEventController,
} from "../play/scripts/ScriptEventController.js";

function harness() {
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
  });
  return {
    controller, sent, presentation, presentationCalls, dialogueCalls, errors,
    scriptStarts,
  };
}

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
