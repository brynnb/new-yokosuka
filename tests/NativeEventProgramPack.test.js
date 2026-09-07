import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeEventInterpreter,
} from "../play/events/NativeEventInterpreter.js";
import {
  createNativeActorByteStateSemanticHandlers,
  createNativeDialogueChannelSemanticHandlers,
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

const pack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

test("generated D000 pack retains its exact static program closure", () => {
  assert.equal(
    pack.schema,
    "new-yokosuka-native-event-program-pack-v1",
  );
  const program = pack.programs.find(
    item => item.id === "disc1-d000-entry-0x7abf4",
  );
  assert.equal(program.mapinfoSha256, (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e"
    + "9b7e"
  ));
  assert.equal(program.entryFunction, "0x7abf4");
  assert.equal(
    program.scriptedInteractions[0].entryFunction,
    "0x8002c",
  );
  assert.equal(
    program.scriptedInteractions[0].dialogueEntryFunction,
    "0x7fa98",
  );
  assert.equal(program.summary.functionCount, 86);
  assert.equal(program.summary.actionKinds.frameFieldExpressionWrite, 47);
  assert.equal(program.summary.actionKinds.frameFieldAdd, undefined);
  assert.ok(program.functions.some(item => item.id === "0x7fa98"));
});

test("selector-18 pack pins exact operation 0x013e resource pairs", () => {
  const program = pack.programs.find(
    item => item.automaticEvents?.some(event => event.id === "d000-selector-18"),
  );
  assert.deepEqual(program.operation013eStaticBindings, [
    {
      slot: 0,
      primaryPointer: 0xb138a,
      secondaryPointer: 0xb1391,
      callFileOffsets: ["0x8598a"],
    },
    {
      slot: 1,
      primaryPointer: 0xb1392,
      secondaryPointer: 0xb1399,
      callFileOffsets: ["0x859ae"],
    },
  ]);
});

test("executes the recovered Hato voice coroutine and state sequence", async () => {
  const program = pack.programs.find(
    item => item.id === "disc1-d000-entry-0x7abf4",
  );
  const actorByteState = createNativeActorByteState({ HATO: 7 });
  const starts = [];
  const handlers = {
    ...createNativeDialogueChannelSemanticHandlers({
      startDialogue: (detail) => {
        starts.push(detail);
        return {
          handle: 1,
          request: {
            kind: "dialogue",
            voiceIds: detail.dialogueRegion.voiceIds,
          },
        };
      },
      isDialogueActive: () => false,
    }),
    ...createNativeActorByteStateSemanticHandlers({ actorByteState }),
  };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: createNativeEventOperationExecutor({ handlers }),
  });

  const first = await interpreter.run(null, {
    entryFunction: "0x7fa98",
  });
  assert.equal(first.status, "yielded");
  assert.deepEqual(first.request, {
    kind: "dialogue",
    voiceIds: ["F1030B001"],
  });
  assert.equal(starts[0].resourcePointer, 0xb0f48);

  const second = await interpreter.run(first.state);
  assert.equal(second.status, "completed");
  assert.equal(actorByteState.read("HATO"), 8);
});
