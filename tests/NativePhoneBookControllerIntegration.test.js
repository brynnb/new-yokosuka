import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AnimationStateMachine,
} from "../play/characters/AnimationStateMachine.js";
import {
  createNativeDialogueState,
} from "../play/dialogue/NativeDialogueState.js";
import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  createNativePlayerScriptedMotionRuntime,
} from "../play/events/NativePlayerScriptedMotionRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  composeNativeRoomScene,
} from "../play/events/NativeRoomSceneComposition.js";
import {
  createNativeSceneResourceRegistry,
} from "../play/events/NativeSceneResourceRegistry.js";
import {
  applyNativeRoomScriptProfile,
} from "../play/events/NativeRoomScriptProfiles.js";
import {
  dispatchNativeRoomSoundCommand,
} from "../play/events/NativeRoomSoundCommands.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";
import {
  createNativeFreeConversationState,
} from "../play/events/NativeScriptedSceneRuntime.js";
import {
  nativeFailureDetail,
} from "../play/scripts/NativeScriptActivityRunner.js";
import {
  createNativeSelectedObjectActionController,
} from "../play/scripts/NativeSelectedObjectActionController.js";
import { MotnLoader } from "../src/MotnLoader.js";

const programPack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

function createTelephoneBookAnimation() {
  const motion = MotnLoader.parse(readFileSync(new URL(
    "../play/assets/dobuita/M_D000.MOTN",
    import.meta.url,
  )));
  const animation = new AnimationStateMachine({
    renderMatrixByKey: new Map(),
    emotes: [],
    runtimeEmotes: [],
    pickerEmoteIds: new Set(),
    gameTicksPerSecond: 30,
    emoteBlendTicks: 1,
    locomotionBlendSeconds: 0,
    locomotionStates: new Set(["idle"]),
    applyPose: () => {},
  });
  const nativeMotions = new Map([
    [0x7007, "AKI_MEKURU_TELBOOK_LP_F"],
    [0x7009, "AKI_OKU_TELBOOK_90_F"],
    [0x700a, "AKI_OPEN_TELBOOK_F"],
    [0x700b, "AKI_OPEN_TELBOOK_LP_F"],
    [0x700f, "AKI_TORU_TELBOOK_90_F"],
  ]);
  animation.clips = {
    idle: animation.buildClip(
      motion,
      "AKI_TORU_TELBOOK_90_F",
      { settleLoop: false },
    ),
  };
  for (const [request, name] of nativeMotions) {
    animation.clips[`native-motion:${request}`] = animation.buildClip(
      motion,
      name,
      { settleLoop: false },
    );
  }
  animation.reset();
  return animation;
}

function requireNoNativeStop(stopped) {
  const result = stopped.at(-1);
  if (!result) return;
  throw new Error(
    `specialized activity TBK1 stopped: ${nativeFailureDetail(result)}`,
  );
}

test("phone-book controller continues after exact resource activity", async () => {
  const route = programPack.programs
    .flatMap(program => (program.scriptedInteractions || []).map(interaction => ({
      program,
      interaction,
    })))
    .find(({ interaction }) => interaction.objectTag === "TBK1");
  assert.equal(route.program.id, "disc1-d000-phone-book-0x6a49c");
  assert.equal(route.interaction.entryFunction, "0x6a49c");
  assert.equal(route.program.roomControllers.length, 1);
  assert.equal(
    route.program.roomControllers[0].entryFunction,
    "0x69b14",
  );

  const dialogueState = createNativeDialogueState();
  dialogueState.write(2, 180, 1);
  const sceneState = createNativeSceneGameplayState();
  const taggedCalls = [];
  const createdRecords = [];
  const cameraRequests = [];
  const cameraModes = [];
  const motionRequests = [];
  const soundCommands = [];
  const lookPointRequests = [];
  const selectedObjectActionController =
    createNativeSelectedObjectActionController();
  const animation = createTelephoneBookAnimation();
  const resourceRegistry = createNativeSceneResourceRegistry();
  resourceRegistry.register({
    path: "/scene/01/D000/",
    name: "DESA",
    ready: true,
  });
  const resourceAdapter = resourceRegistry.adapter();
  const playerControllerRuntime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const roomRuntime = createNativeRoomScriptRuntime({
    sceneState,
    randomFloat: () => 0,
    scriptedScene: {
      freeConversationState: createNativeFreeConversationState({
        dialogueState,
      }),
      readActorControllerStatus: detail => (
        playerControllerRuntime.readControllerStatus(detail)
      ),
      writeActorControllerFlagBit3: detail => (
        playerControllerRuntime.writeControllerFlagBit3(detail)
      ),
      requestEventCamera(detail) {
        cameraRequests.push(detail);
        return true;
      },
      selectCameraMode(detail) {
        cameraModes.push(detail);
        return true;
      },
      requestActorMotion(detail) {
        motionRequests.push(detail);
        return playerControllerRuntime.requestMotion(detail);
      },
      readActorMotionStatus: detail => (
        playerControllerRuntime.readMotionStatus(detail)
      ),
      dispatchSoundCommand(detail) {
        soundCommands.push(detail);
        return dispatchNativeRoomSoundCommand({
          ...detail,
          area: "D000",
          playCommand: (commandHex, options) => {
            soundCommands.push({ commandHex, options });
          },
        });
      },
      controlActorLookPoint(detail) {
        lookPointRequests.push(detail);
        return detail.actorCode === "AKIR";
      },
    },
    taggedObjectAction: {
      executeTaggedObjectAction(detail) {
        taggedCalls.push(detail);
        return selectedObjectActionController.execute(detail);
      },
    },
    operation013c: {
      createRecord(detail) {
        createdRecords.push(structuredClone(detail));
        return resourceAdapter.createRecord(detail);
      },
      releaseRecord: resourceAdapter.releaseRecord,
    },
    transaction: {
      begin: () => playerControllerRuntime.beginTransaction(),
      update: () => {
        animation.update(1 / 30, animation.state);
        const words = playerControllerRuntime.readMomtNumericWords();
        if (!words) return;
        sceneState.configureActorMomtNumericQueryState({
          objectTag: "AKIR",
          actorAvailable: true,
          momtAvailable: true,
          ...words,
        });
        const offset = playerControllerRuntime.readMomtScaledOffsetWords();
        if (!offset) return;
        sceneState.configureActorMomtScaledOffsetState({
          objectTag: "AKIR",
          actorAvailable: true,
          momtAvailable: true,
          ...offset,
          positionWords: [0, 0, 0],
          parentTransform: null,
        });
      },
      commit: ({ external }) => (
        playerControllerRuntime.commitTransaction(external)
      ),
      rollback: ({ external }) => (
        playerControllerRuntime.rollbackTransaction(external)
      ),
    },
  });
  roomRuntime.activateArea("D000");
  applyNativeRoomScriptProfile(sceneState, "D000");
  sceneState.configureObjectMapcRecord({
    objectTag: "AKIR",
    objectAvailable: true,
    recordAvailable: false,
  });
  sceneState.configureActorOsagState({
    actorTag: "AKIR",
    available: true,
    osagNodeBytes: null,
    controllerFlagByte: 0x08,
  });
  sceneState.configureActorMomtByte6fState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    value: 0,
  });
  sceneState.configureActorMomtFlagState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    flagsWord: 0,
  });
  composeNativeRoomScene(sceneState, {
    objects: [
      { objectTag: "TBK1", nativePosition: [0, 0, 0], records: ["FIXO"] },
      { objectTag: "TBK3", nativePosition: [0, 0, 0], records: ["FIXO"] },
    ],
    attachmentTargets: [{
      objectTag: "AKIR",
      hasMomtRecord: true,
      controlIds: [12, 18],
    }],
  });
  sceneState.writeObjectVector("AKIR", [0, 0, 0]);

  const dialogueRequests = [];
  const stopped = [];
  const completions = [];
  const settlements = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack,
    actorByteState: createNativeActorByteState(),
    createExecution: detail => roomRuntime.beginTransaction(detail),
    onDialogueRequest: request => dialogueRequests.push(request),
    onStopped: detail => stopped.push(detail),
    onComplete: detail => completions.push(detail),
  });
  const unsubscribeSettlement = runtime.onSettled(
    settlement => settlements.push(settlement),
  );
  assert.equal(
    runtime.roomControllerForObject("D000", "TBK1")?.id,
    "disc1-d000-primary-interaction-owner",
  );
  const selectedObjectActionToken = selectedObjectActionController.claim({
    area: "D000",
    objectTag: "TBK1",
    action: 1,
    sceneObject: { objectTag: "TBK1" },
  });
  const result = await runtime.startObjectInteraction({
    area: "D000",
    objectTag: "TBK1",
    context: {
      selectedObjectTag: "TBK1",
      selectedObjectAction: 1,
      ...roomRuntime.eventContext(),
    },
  });

  assert.equal(result.status, "yielded", JSON.stringify(result));
  assert.notEqual(runtime.status, "idle");
  for (
    let tick = 0;
    tick < 512
    && runtime.status === "continuation";
    tick += 1
  ) {
    assert.equal(runtime.update(), true);
    await new Promise(resolve => setImmediate(resolve));
  }
  requireNoNativeStop(stopped);
  assert.deepEqual(
    taggedCalls.map(({ mode, objectTag }) => [mode, objectTag]),
    [
      [1, "TBK1"],
      [4, "TBK1"],
      [5, "TBK1"],
    ],
  );
  assert.deepEqual(
    createdRecords,
    [{
      argument2: 0xca04,
      argument3: 0xca14,
      argument2String: "/scene/01/D000/",
      argument3String: "DESA",
    }],
  );
  assert.deepEqual(
    cameraRequests.map(({ cameraNumber }) => cameraNumber),
    [4310],
  );
  assert.equal(motionRequests[0]?.request, 0x700f);
  assert.equal(
    sceneState.readNativeOperation013cContainer().record56,
    null,
  );
  assert.equal(runtime.status, "dialogue");
  assert.equal(dialogueRequests.length, 1);
  assert.deepEqual(dialogueRequests[0].voiceIds, [
    "SA1071A001",
    "SA1071A002",
    "SA1071A003",
    "SA1071A004",
  ]);

  const resumed = await runtime.resumeDialogue();
  assert.equal(
    resumed.status === "completed" || resumed.status === "yielded",
    true,
    JSON.stringify(resumed),
  );
  for (
    let tick = 0;
    tick < 1024 && runtime.status === "continuation";
    tick += 1
  ) {
    assert.equal(runtime.update(), true);
    await new Promise(resolve => setImmediate(resolve));
  }
  requireNoNativeStop(stopped);
  assert.equal(runtime.status, "complete", JSON.stringify(stopped.at(-1)));
  assert.equal(completions.length, 1);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].kind, "completed");
  assert.equal(settlements[0].result, completions[0]);
  assert.equal(
    completions[0].roomControllerId,
    "disc1-d000-primary-interaction-owner",
  );
  assert.equal(completions[0].roomControllerCheckpoint, true);
  assert.deepEqual(sceneState.taggedObjectController.read(), {
    activePair: ["YKUL", "YKUR"],
    configurationPointer: 0xae354,
    revision: 2,
  });
  assert.deepEqual(sceneState.globalController.initializedRange, {
    argument0: 15,
    argument1: 7,
    argument2: 0,
  });
  assert.equal(sceneState.readCurrentEventControlRecord(), undefined);
  assert.deepEqual(
    cameraModes.map(({ mode }) => mode),
    [9, 0],
  );
  assert.deepEqual(
    motionRequests.map(({ request }) => request),
    [0x700f, 0x700a, 0x700b, 0x7007, 0x7009],
  );
  assert.deepEqual(soundCommands[0].arguments, [0x006805a9, 0, 0]);
  assert.deepEqual(soundCommands[1], {
    commandHex: "a9056800",
    options: { bank: "f1dobuit" },
  });
  assert.deepEqual(
    sceneState.readObjectVector("TBK3"),
    [
      nativeFloat32Word(100),
      nativeFloat32Word(100),
      nativeFloat32Word(100),
    ],
  );
  assert.equal(
    sceneState.readNativeField({ offset: 0x0c29b130, width: 4 }),
    0,
  );
  assert.equal(
    sceneState.readNativeField({ offset: 0x0c29b134, width: 4 }),
    0xffffffff,
  );
  assert.equal(
    playerControllerRuntime.readControllerState().controllerFlagsDword5c,
    8,
  );
  assert.equal(
    sceneState.readNativeOperation013cContainer().record56,
    null,
  );

  assert.equal(
    selectedObjectActionController.release(selectedObjectActionToken),
    true,
  );
  const secondSelectedObjectActionToken =
    selectedObjectActionController.claim({
      area: "D000",
      objectTag: "TBK1",
      action: 1,
      sceneObject: { objectTag: "TBK1" },
    });

  const second = await runtime.startObjectInteraction({
    area: "D000",
    objectTag: "TBK1",
    context: {
      selectedObjectTag: "TBK1",
      selectedObjectAction: 1,
      ...roomRuntime.eventContext(),
    },
  });
  assert.equal(second.status, "yielded", JSON.stringify(second));
  assert.equal(sceneState.taggedObjectController.read().revision, 2);
  assert.equal(runtime.cancel("test-second-dispatch"), true);
  assert.equal(settlements.length, 2);
  assert.equal(settlements[1].kind, "cancelled");
  assert.equal(
    selectedObjectActionController.release(secondSelectedObjectActionToken),
    true,
  );
  unsubscribeSettlement();
});
