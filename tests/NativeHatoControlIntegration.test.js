import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeActorByteStateSemanticHandlers,
  createNativeDialogueChannelSemanticHandlers,
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  createNativeEventInterpreter,
} from "../play/events/NativeEventInterpreter.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  createNativeRuntimeInterfaceExecutor,
} from "../play/events/NativeRuntimeInterface.js";
import {
  createNativeFreeConversationState,
} from "../play/events/NativeScriptedSceneRuntime.js";

const pack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

test("executes the complete generated Hato control entry in authored order", async () => {
  const program = pack.programs.find(
    item => item.id === "disc1-d000-entry-0x7abf4",
  );
  const operations = [];
  let dialogueActive = false;
  let xmptStateZero = false;
  const actorByteState = createNativeActorByteState({ HATO: 4 });
  const room = createNativeRoomScriptRuntime({
    randomFloat: () => 0.5,
    scriptedScene: {
      requestEventCamera: detail => {
        operations.push(["camera", detail.cameraNumber]);
        return true;
      },
      selectCameraMode: detail => {
        operations.push(["camera-mode", detail.mode]);
        return true;
      },
      requestActorMotion: detail => {
        operations.push(["motion", detail.actorCode, detail.request]);
        return true;
      },
      readActorMotionStatus: () => 2,
      controlActorLookPoint: detail => {
        operations.push(["look-point", detail.actorCode, detail.selector]);
        return true;
      },
      requestActorXmpt: detail => {
        operations.push(["xmpt", detail.actorCode, detail.target]);
        xmptStateZero = true;
        return true;
      },
      readActorXmptStateZero: () => xmptStateZero,
      freeConversationState: createNativeFreeConversationState(),
    },
    primaryRuntime: {
      invokePrimaryRuntimeTransition: value => {
        operations.push(["primary-callback", value]);
      },
    },
    operation013c: {
      queryPlatformActivity: () => false,
    },
    operation0166: {
      clearModeTwoLinkedRecords: () => {
        operations.push(["0166-mode-2-cleanup"]);
      },
      releaseModeThreeLists: () => {
        operations.push(["0166-mode-3-release"]);
      },
      releaseModeEighteenLists: () => {
        operations.push(["0166-mode-18-release"]);
      },
      notifyModeEightEnabled: value => {
        operations.push(["0166-mode-8-notify", value]);
      },
    },
  });

  room.sceneState.configurePrimaryRuntimeState({
    available: true,
    currentEventPresent: true,
  });
  room.sceneState.nativeOperation0166State.configureControl({
    modeTwoControlDword: 1,
    modeEightControlDword: 0,
    modeTwoCleanupRequired: false,
  });
  room.sceneState.configureActorMomtFlagState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
  });
  room.sceneState.writeObjectVector("AKIR", [
    nativeFloat32Word(1),
    nativeFloat32Word(2),
    nativeFloat32Word(3),
  ], { associated: true });
  for (const [offset, value, width = 4] of [
    [0x84, 0xffffffff],
    [0xb0, 0, 1],
    [0x105, 0, 1],
    [0xd4, nativeFloat32Word(-119.13939666748047)],
    [0xd8, nativeFloat32Word(0)],
    [0xdc, nativeFloat32Word(79.6144027709961)],
    [0xec, nativeFloat32Word(-121.16000366210938)],
    [0xf0, nativeFloat32Word(-1.7999999523162842)],
    [0xf4, nativeFloat32Word(77.94000244140625)],
  ]) {
    room.sceneState.writeNativeField({ offset, width, value });
  }

  const handlers = {
    ...room.semanticHandlers(),
    ...createNativeActorByteStateSemanticHandlers({ actorByteState }),
    ...createNativeDialogueChannelSemanticHandlers({
      startDialogue: detail => {
        dialogueActive = true;
        operations.push(["dialogue", detail.dialogueRegion.voiceIds]);
        return {
          handle: 1,
          request: {
            kind: "dialogue",
            voiceIds: detail.dialogueRegion.voiceIds,
          },
        };
      },
      isDialogueActive: () => dialogueActive,
    }),
  };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: createNativeEventOperationExecutor({ handlers }),
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });
  const context = {
    ...room.eventContext(),
    entryFunction: "0x8002c",
  };

  let result = await interpreter.run(null, context);
  while (
    result.status === "yielded"
    && result.request?.kind === "native-coroutine-continuation"
  ) {
    result = await interpreter.run(result.state, context);
  }
  assert.equal(result.status, "yielded");
  assert.equal(result.request.kind, "dialogue");
  assert.deepEqual(result.request.voiceIds, ["F1030B001"]);

  dialogueActive = false;
  result = await interpreter.run(result.state, context);
  let completedXmptTransition = false;
  let completedRoomTransition = false;
  while (
    result.status === "yielded"
    && result.request?.kind === "native-coroutine-continuation"
  ) {
    if (xmptStateZero) {
      xmptStateZero = false;
      completedXmptTransition = true;
    } else if (
      room.sceneState.readNativeField({ offset: 0xb0, width: 1 }) === 1
    ) {
      room.sceneState.writeNativeField({
        offset: 0xb0,
        width: 1,
        value: 0,
      });
      completedRoomTransition = true;
    }
    result = await interpreter.run(result.state, context);
  }

  assert.equal(
    result.status,
    "completed",
    JSON.stringify({
      reason: result.reason,
      location: result.location,
    }),
  );
  assert.equal(completedXmptTransition, true);
  assert.equal(completedRoomTransition, true);
  assert.equal(actorByteState.read("HATO"), 5);
  assert.deepEqual(
    room.sceneState.readObjectSecondaryVector("AKIR", { associated: true }),
    [
      nativeFloat32Word(-121.16000366210938),
      nativeFloat32Word(-1.7999999523162842),
      nativeFloat32Word(77.94000244140625),
    ],
  );
  assert.deepEqual(operations, [
    ["0166-mode-3-release"],
    ["0166-mode-18-release"],
    ["camera", 2952],
    ["look-point", "HATO", 15],
    ["motion", "AKIR", 903],
    ["dialogue", ["F1030B001"]],
    ["motion", "AKIR", 100],
    ["look-point", "HATO", -16],
    ["camera-mode", 0],
    ["xmpt", "AKIR", [
      -121.16000366210938,
      -1.7999999523162842,
      77.94000244140625,
    ]],
    ["primary-callback", 1],
    ["0166-mode-8-notify", 1],
  ]);
});
