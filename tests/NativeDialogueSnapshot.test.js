import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueSnapshot,
  NATIVE_DIALOGUE_SNAPSHOT_SCHEMA,
} from "../play/dialogue/NativeDialogueSnapshot.js";

test("native dialogue snapshot round-trips all mutable interpreter state", () => {
  const first = createNativeDialogueSnapshot();
  first.dialogueState.write(2, 104, 1);
  first.progressState.writeOffset(9, "selected", 812);
  first.progressAllocator.resolve("AKIR");
  first.randomState.beginMessageConstruction();
  first.randomState.choose(4, () => 0.75);
  first.actorByteState.write("HATO", 3);
  first.persistentScriptBitState.write(202, 1);

  const encoded = first.toJSON();
  assert.equal(encoded.schema, NATIVE_DIALOGUE_SNAPSHOT_SCHEMA);
  assert.equal(encoded.revision, 0);
  assert.equal(typeof encoded.progress, "string");
  assert.ok(encoded.progress.length < 6_000);

  const second = createNativeDialogueSnapshot(
    JSON.parse(JSON.stringify(encoded)),
  );
  assert.equal(second.dialogueState.read(2, 104), 1);
  assert.equal(second.progressState.record(9).selectedEntryOffset, 812);
  assert.deepEqual(second.progressAllocator.toJSON(), first.progressAllocator.toJSON());
  assert.deepEqual(second.randomState.toJSON(), first.randomState.toJSON());
  assert.equal(second.actorByteState.read("HATO"), 3);
  assert.equal(second.gameplayState().actorByteState.read("HATO"), 3);
  assert.equal(second.persistentScriptBitState.read(202), 1);
  assert.equal(second.gameplayState().persistentScriptBitState.read(202), 1);
  assert.deepEqual(second.toJSON(), encoded);
});

test("native dialogue snapshot rejects malformed transport state", () => {
  const encoded = createNativeDialogueSnapshot().toJSON();
  encoded.progress = "not base64";
  assert.throws(
    () => createNativeDialogueSnapshot(encoded),
    /canonical base64/,
  );
  assert.throws(
    () => createNativeDialogueSnapshot({ schema: "future" }),
    /Unsupported/,
  );
});

test("native dialogue snapshot accepts only the next saved revision", () => {
  const snapshot = createNativeDialogueSnapshot();
  const response = snapshot.toJSON();
  response.revision = 1;
  assert.equal(snapshot.acceptSavedSnapshot(response).revision, 1);
  assert.throws(
    () => snapshot.acceptSavedSnapshot(response),
    /unexpected revision/,
  );
});
