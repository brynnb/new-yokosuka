import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";

const programPack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

test("reviewed composite entry receives its native constructor state", async () => {
  const room = createNativeRoomScriptRuntime();
  room.activateArea("JU00");
  const runtime = createNativeScriptedEventRuntime({
    programPack,
    actorByteState: createNativeActorByteState(),
    createExecution: detail => room.beginTransaction(detail),
  });

  const result = await runtime.startProgram({
    programId: "disc1-ju00-kitten-care-owner-0x27554",
    entryFunction: "0x2aa70",
    area: "JU00",
  });

  assert.equal(result.status, "yielded");
  assert.equal(result.request.kind, "native-coroutine-continuation");
  assert.equal(result.location.functionId, "0x2aa70");
  assert.equal(result.location.blockId, "0x2ab54");
  assert.equal(
    room.sceneState.readNativeField({ offset: 0x280, width: 4 }),
    0xffffffff,
  );
  assert.deepEqual(room.sceneState.readObjectVector("CATM"), [
    0x420aaee6,
    0x40275c29,
    0x421a1412,
  ]);
  assert.deepEqual(room.sceneState.nativeOperation001cState.planNormal({
    objectTag: "CATM",
    destination: 0,
    associated: false,
  }).words, [0, 0x560b, 0]);

  assert.equal(runtime.cancel("test-complete"), true);
  assert.equal(
    room.sceneState.readNativeField({ offset: 0x280, width: 4 }),
    undefined,
  );
});
