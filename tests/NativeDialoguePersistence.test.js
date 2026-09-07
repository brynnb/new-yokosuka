import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialoguePersistence,
} from "../play/dialogue/NativeDialoguePersistence.js";

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
