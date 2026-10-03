import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialoguePersistence,
} from "../play/dialogue/NativeDialoguePersistence.js";
import { createNativeDialogueSnapshot } from "../play/dialogue/NativeDialogueSnapshot.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

test("server ownership flushes old writes and applies settled flags only after presentation cleanup", async () => {
  const requests = [];
  const persistence = createNativeDialoguePersistence({saveSnapshot: async snapshot => {
    requests.push(snapshot);
    return {...snapshot, revision: snapshot.revision + 1};
  }});
  persistence.hydrate(null);
  persistence.snapshot.dialogueState.write(2, 900, 1);
  persistence.markDirty();
  const finish = await persistence.beginServerEvent();
  assert.equal(requests.length, 1);
  const presentationBaseline = persistence.captureWorkingState();
  persistence.snapshot.dialogueState.write(2, 901, 1);
  await persistence.persistMutation();
  assert.equal(requests.length, 1, "presentation must not save native state");
  const server = createNativeDialogueSnapshot(presentationBaseline);
  server.dialogueState.write(2, 832, 1);
  server.revision++;
  assert.equal(persistence.acceptServerSnapshot(server.toJSON()), true);
  assert.equal(persistence.snapshot.dialogueState.read(2, 832), 0);
  // The activity's own cleanup restores its earlier working state first.
  persistence.restoreWorkingState(presentationBaseline);
  assert.equal(finish(), true);
  assert.equal(persistence.snapshot.dialogueState.read(2, 832), 1);
  assert.equal(persistence.snapshot.dialogueState.read(2, 901), 0);
  assert.equal(persistence.snapshot.dialogueState.read(2, 900), 1);
  assert.equal(persistence.snapshot.revision, 2);
  assert.equal(finish(), false);
  await persistence.persistMutation();
  assert.equal(requests.length, 1, "receipt was already saved on the server");
});

test("gate-pass receipt survives later cancellation and out-of-order duplicate receipts", async () => {
  const persistence = createNativeDialoguePersistence({saveSnapshot: async () => { throw new Error("unexpected save"); }});
  const initial = persistence.hydrate(null).toJSON();
  const finish = await persistence.beginServerEvent();
  const first = createNativeDialogueSnapshot(initial);
  first.dialogueState.write(2, 832, 1);
  first.revision = 1;
  persistence.acceptServerSnapshot(first.toJSON());
  const second = createNativeDialogueSnapshot(first.toJSON());
  second.dialogueState.write(2, 833, 1);
  second.revision = 2;
  persistence.acceptServerSnapshot(second.toJSON());
  assert.equal(persistence.acceptServerSnapshot(first.toJSON()), false);
  assert.equal(persistence.acceptServerSnapshot(second.toJSON()), false);
  finish(); // No final complete reply is necessary for these already-committed effects.
  assert.deepEqual(persistence.captureWorkingState(), second.toJSON());
  assert.throws(() => persistence.acceptServerSnapshot({...second.toJSON(), state: initial.state}), /without advancing/);
  assert.throws(() => persistence.acceptServerSnapshot({revision: 3}), /incomplete/);
  for (const actorBytes of [true, [], { AKIR: "1" }]) {
    assert.throws(() => persistence.acceptServerSnapshot({
      ...second.toJSON(), revision: 3, gameState: { ...second.toJSON().gameState, actorBytes },
    }), /incomplete/);
  }
});

test("late save success and failure cannot modify a newly hydrated character", async () => {
  for (const outcome of ["success", "conflict", "failure"]) {
    const reply = deferred(), started = deferred(), errors = [];
    const persistence = createNativeDialoguePersistence({
      saveSnapshot: snapshot => { started.resolve(snapshot); return reply.promise; },
      onSaved: () => errors.push("old save"), onConflict: () => errors.push("old conflict"), onError: () => errors.push("old error"),
    });
    persistence.hydrate(null).dialogueState.write(2, 900, 1);
    const saving = persistence.persistMutation();
    const request = await started.promise;
    const next = createNativeDialogueSnapshot();
    next.revision = 12;
    persistence.hydrate(next.toJSON());
    if (outcome === "success") reply.resolve({...request,revision:1});
    else reply.reject(Object.assign(new Error(outcome), {status:409, ...(outcome === "conflict" ? {dialogueState:request} : {})}));
    await saving;
    assert.deepEqual(persistence.captureWorkingState(), next.toJSON(), outcome);
    assert.deepEqual(errors, []);
  }
});

test("late server cleanup and queued saves are fenced across session replacement", async () => {
  let saves = 0;
  const persistence = createNativeDialoguePersistence({saveSnapshot: async snapshot => { saves++; return {...snapshot,revision:snapshot.revision+1}; }});
  persistence.hydrate(null);
  const finish = await persistence.beginServerEvent();
  const replacement = createNativeDialogueSnapshot();
  replacement.revision = 20;
  persistence.hydrate(replacement.toJSON());
  assert.equal(finish(), false);
  persistence.snapshot.dialogueState.write(2, 900, 1);
  const queued = persistence.persistMutation();
  persistence.clear();
  await queued;
  assert.equal(saves, 0);
  assert.equal(persistence.acceptServerSnapshot(replacement.toJSON()), false);
});

test("native dialogue persistence serializes revisions and later mutations", async () => {
  const requests = [];
  let releaseFirst;
  let markFirstStarted;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });
  const persistence = createNativeDialoguePersistence({
    saveSnapshot: async (snapshot) => {
      requests.push(structuredClone(snapshot));
      if (requests.length === 1) {
        markFirstStarted();
        await firstGate;
      }
      return { ...snapshot, revision: snapshot.revision + 1 };
    },
  });
  const snapshot = persistence.hydrate(null);
  snapshot.dialogueState.write(2, 10, 1);
  snapshot.persistentScriptBitState.write(200, 1);
  const first = persistence.persistMutation();
  await firstStarted;
  snapshot.dialogueState.write(2, 11, 1);
  const second = persistence.persistMutation();
  releaseFirst();
  await Promise.all([first, second]);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].revision, 0);
  assert.equal(requests[0].gameState.scriptBits, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAA=");
  assert.equal(requests[1].revision, 1);
  assert.equal(persistence.snapshot.revision, 2);
});

test("native dialogue persistence rehydrates a revision conflict before the next save", async () => {
  const conflicts = [];
  const requests = [];
  const conflict = Object.assign(new Error("revision conflict"), {
    status: 409,
    dialogueState: {
      revision: 3,
    },
  });
  const persistence = createNativeDialoguePersistence({
    saveSnapshot: async (snapshot) => {
      requests.push(structuredClone(snapshot));
      if (requests.length === 1) throw conflict;
      return { ...snapshot, revision: snapshot.revision + 1 };
    },
    onConflict: (snapshot, error) => {
      conflicts.push([snapshot.revision, error]);
    },
  });
  persistence.hydrate(null);
  persistence.snapshot.dialogueState.write(2, 12, 1);
  const recovered = await persistence.persistMutation();
  assert.equal(recovered.revision, 3);
  assert.deepEqual(conflicts, [[3, conflict]]);

  recovered.dialogueState.write(2, 12, 1);
  const saved = await persistence.persistMutation();
  assert.deepEqual(requests.map((request) => request.revision), [0, 3]);
  assert.equal(saved.revision, 4);
});

test("native dialogue persistence rolls an incomplete event back to server state", () => {
  const persistence = createNativeDialoguePersistence({
    saveSnapshot: async () => null,
  });
  persistence.hydrate(null);
  persistence.snapshot.dialogueState.write(2, 99, 1);
  persistence.markDirty();
  const restored = persistence.rollback();
  assert.equal(restored.dialogueState.read(2, 99), 0);
  assert.equal(restored.revision, 0);
});

test("native dialogue persistence does not save an unchanged snapshot", async () => {
  let requestCount = 0;
  const persistence = createNativeDialoguePersistence({
    saveSnapshot: async () => {
      requestCount += 1;
      throw new Error("unchanged state should not be saved");
    },
  });
  persistence.hydrate(null);

  const result = await persistence.persistMutation();

  assert.equal(requestCount, 0);
  assert.equal(result.revision, 0);
});

test("native dialogue persistence restores an isolated activity working state", async () => {
  let requestCount = 0;
  const persistence = createNativeDialoguePersistence({
    saveSnapshot: async () => {
      requestCount += 1;
      throw new Error("restored activity state should not be saved");
    },
  });
  persistence.hydrate(null);
  const beforeActivity = persistence.captureWorkingState();

  persistence.snapshot.dialogueState.write(2, 41, 1);
  persistence.restoreWorkingState(beforeActivity);

  assert.equal(persistence.snapshot.dialogueState.read(2, 41), 0);
  assert.deepEqual(persistence.captureWorkingState(), beforeActivity);
  await persistence.persistMutation();
  assert.equal(requestCount, 0);
});

test("native dialogue sandbox restores test state without saving it", async () => {
  let requestCount = 0;
  const persistence = createNativeDialoguePersistence({
    saveSnapshot: async () => {
      requestCount += 1;
      throw new Error("sandbox state must not be saved");
    },
  });
  persistence.hydrate(null);
  persistence.snapshot.dialogueState.write(2, 20, 1);
  persistence.markDirty();
  const baseline = persistence.captureWorkingState();

  persistence.beginSandbox();
  persistence.snapshot.dialogueState.write(2, 180, 1);
  await persistence.persistMutation();
  assert.equal(persistence.snapshot.dialogueState.read(2, 180), 1);
  assert.equal(requestCount, 0);

  assert.equal(persistence.endSandbox(), true);
  assert.deepEqual(persistence.captureWorkingState(), baseline);
  assert.equal(persistence.endSandbox(), false);
});
