import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeFreeConversationState,
} from "../play/events/NativeScriptedSceneRuntime.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  createNativePlayerScriptedMotionRuntime,
} from "../play/events/NativePlayerScriptedMotionRuntime.js";
import {
  createNativePlayerXmptRuntime,
} from "../play/events/NativePlayerXmptRuntime.js";
import {
  createNativeEventCameraRuntime,
} from "../play/events/NativeEventCameraRuntime.js";

const generatedPack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

function createAnimationHarness() {
  let playbackRevision = 0;
  return {
    activeEmote: null,
    activeOneShot: null,
    requests: [],
    releases: [],
    nativeMotionDescriptor(request) {
      return request === 0x055e
        ? { rootMotionKind: "travel", speed: 4 }
        : null;
    },
    playNativeMotionRequest(request, options) {
      this.requests.push({ request, options });
      this.activeOneShot = {
        playbackRevision: ++playbackRevision,
        options,
      };
      return true;
    },
    releaseOneShot(nextState) {
      if (!this.activeOneShot) return false;
      this.releases.push(nextState);
      this.activeOneShot = null;
      return true;
    },
    complete() {
      this.activeOneShot?.options.onComplete();
    },
  };
}

async function advanceContinuation(runtime, deltaSeconds = 0) {
  assert.equal(runtime.status, "continuation");
  assert.equal(runtime.update(deltaSeconds), true);
  await nextTurn();
}

test("complete Hato control entry preserves every authored phase boundary", async () => {
  const eventPack = generatedPack;
  assert.equal(
    eventPack.programs[0].scriptedInteractions[0].entryFunction,
    "0x8002c",
  );
  const dialogueState = createNativeDialogueState();
  const actorByteState = createNativeActorByteState({ HATO: 4 });
  const sceneState = createNativeSceneGameplayState();
  sceneState.configureActorMomtFlagState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    flagsWord: 0,
  });
  sceneState.configureActorLookPointState({
    actorTag: "HATO",
    actorAvailable: true,
    controllerAvailable: true,
    defaultVector: [
      nativeFloat32Word(-121.5),
      nativeFloat32Word(0),
      nativeFloat32Word(77.5),
    ],
  });
  sceneState.writeObjectVector(
    "AKIR",
    [nativeFloat32Word(1), nativeFloat32Word(2), nativeFloat32Word(3)],
    { associated: true },
  );
  for (const [offset, width, value] of [
    [0x105, 1, 0],
    [0xec, 4, nativeFloat32Word(-121.16000366210938)],
    [0xf0, 4, nativeFloat32Word(-1.7999999523162842)],
    [0xf4, 4, nativeFloat32Word(77.94000244140625)],
  ]) {
    sceneState.writeNativeField({ offset, width, value });
  }

  const calls = [];
  const animation = createAnimationHarness();
  const playerMotionRuntime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const cameraFrames = [];
  let cameraReleases = 0;
  const eventCameraRuntime = createNativeEventCameraRuntime({
    programPack: eventPack,
    applyNativeFrame: frame => {
      cameraFrames.push(structuredClone(frame));
      return true;
    },
    releaseNativeFrame: () => {
      cameraReleases += 1;
      return true;
    },
  });
  let playerNativeTransform = {
    position: [
      -119.13939666748047,
      0,
      79.6144027709961,
    ].map(Math.fround),
    facingRaw: 9375,
  };
  const playerXmptRuntime = createNativePlayerXmptRuntime({
    getAnimation: () => animation,
    transferMotionOwnership: () => (
      playerMotionRuntime.releaseForControllerTransfer()
    ),
    readNativeTransform: () => structuredClone(playerNativeTransform),
    writeNativeTransform: next => {
      playerNativeTransform = structuredClone(next);
      return true;
    },
  });
  const roomRuntime = createNativeRoomScriptRuntime({
    sceneState,
    randomFloat: () => 0.5,
    scriptedScene: {
      requestEventCamera: detail => {
        calls.push(["camera", detail.cameraNumber]);
        return eventCameraRuntime.requestCamera(detail);
      },
      selectCameraMode: detail => {
        calls.push(["camera-mode", detail.mode]);
        return eventCameraRuntime.selectMode(detail);
      },
      requestActorMotion: detail => {
        calls.push(["motion", detail.request]);
        return playerMotionRuntime.requestMotion(detail);
      },
      readActorMotionStatus: detail => (
        playerMotionRuntime.readMotionStatus(detail)
      ),
      controlActorLookPoint: detail => {
        calls.push(["look-point", detail.actorCode, detail.selector]);
        const mutation = sceneState.applyActorLookPointControl({
          actorTag: detail.actorCode,
          selector: detail.selector,
          targetVector: detail.target === null
            ? null
            : detail.target.map(nativeFloat32Word),
          mode: detail.mode,
        });
        return mutation.applied === true || mutation.nativeNoOp === true;
      },
      requestActorXmpt: detail => {
        calls.push([
          "xmpt",
          detail.actorCode,
          detail.target,
          detail.requestWord,
          detail.requestDword,
          detail.stateSelector,
        ]);
        sceneState.requestActorXmpt({
          actorTag: detail.actorCode,
          target: detail.target,
          requestWord: detail.requestWord,
          requestDword: detail.requestDword,
          stateSelector: detail.stateSelector,
        });
        return true;
      },
      readActorXmptStateZero: ({ actorCode }) => (
        sceneState.readActorXmptStateZero(actorCode)
      ),
      writeGlobalByteState: ({ value }) => {
        sceneState.writeGlobalByte(value);
        calls.push(["global-byte", value]);
        return true;
      },
      freeConversationState: createNativeFreeConversationState({
        dialogueState,
      }),
    },
    transaction: {
      begin: detail => ({
        eventCamera: eventCameraRuntime.beginTransaction(detail),
        playerMotion: playerMotionRuntime.beginTransaction(),
        playerXmpt: playerXmptRuntime.beginTransaction(),
      }),
      update: ({ external, deltaSeconds }) => {
        eventCameraRuntime.update(deltaSeconds);
        playerXmptRuntime.update(deltaSeconds);
        if (sceneState.readActorXmptState("AKIR")) {
          sceneState.updateActorXmpt(
            "AKIR",
            playerXmptRuntime.controller(),
          );
        }
      },
      commit: ({ external }) => {
        eventCameraRuntime.commitTransaction(external.eventCamera);
        playerXmptRuntime.commitTransaction(external.playerXmpt);
        playerMotionRuntime.commitTransaction(external.playerMotion);
      },
      rollback: ({ external }) => {
        try {
          eventCameraRuntime.rollbackTransaction(external.eventCamera);
        } finally {
          try {
            playerXmptRuntime.rollbackTransaction(external.playerXmpt);
          } finally {
            playerMotionRuntime.rollbackTransaction(external.playerMotion);
          }
        }
      },
    },
  });
  const dialogueRequests = [];
  const stopped = [];
  roomRuntime.activateArea("D000");
  const runtime = createNativeScriptedEventRuntime({
    programPack: eventPack,
    actorByteState,
    createExecution: detail => {
      const execution = roomRuntime.beginTransaction(detail);
      roomRuntime.writeInteractionActorPosition(
        detail.gate.nativePosition,
      );
      const selectedRecordIndex =
        detail.route.nativeSpatialRecordIndex;
      roomRuntime.writeSpatialSelection({ selectedRecordIndex });
      roomRuntime.consumeSpatialSelection({ selectedRecordIndex });
      return execution;
    },
    onDialogueRequest: request => dialogueRequests.push(request),
    onStopped: result => stopped.push(result),
  });
  const context = {
    dialogueState,
    gameDate: new Date("1986-01-01T12:00:00Z"),
    playerPosition: {
      x: 119.13939666748047,
      y: 0,
      z: 79.6144027709961,
    },
    playerYaw: -9375 * Math.PI * 2 / 0x10000,
    ...roomRuntime.eventContext(),
  };

  let result = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context,
  });
  assert.equal(result.status, "yielded", JSON.stringify(result));
  while (runtime.status === "continuation") {
    await advanceContinuation(runtime);
  }
  assert.equal(runtime.status, "dialogue", JSON.stringify(stopped.at(-1)));
  assert.equal(dialogueRequests.length, 1);
  assert.deepEqual(
    calls.filter(call => call[0] === "motion"),
    [["motion", 903]],
  );
  assert.deepEqual(
    calls.filter(call => call[0] === "camera"),
    [["camera", 2952]],
  );
  assert.equal(runtime.update(2.5), true);
  assert.deepEqual(eventCameraRuntime.readFrame().position, [
    -123.21455383300781,
    -0.132750004529953,
    73.7210464477539,
  ]);

  result = await runtime.resumeDialogue();
  if (runtime.status === "continuation") {
    animation.complete();
    await advanceContinuation(runtime);
  }
  while (runtime.status === "continuation") {
    await advanceContinuation(runtime, 1);
  }

  assert.equal(runtime.status, "complete", JSON.stringify(stopped.at(-1)));
  assert.equal(result.status === "completed" || result.status === "yielded", true);
  assert.equal(actorByteState.read("HATO"), 5);
  assert.deepEqual(
    sceneState.readObjectSecondaryVector("AKIR", { associated: true }),
    [
      nativeFloat32Word(-121.16000366210938),
      nativeFloat32Word(-1.7999999523162842),
      nativeFloat32Word(77.94000244140625),
    ],
  );
  assert.equal(sceneState.readActorMomtFlagState("AKIR").flagsWord & 1, 1);
  const lookPoint = sceneState.readActorLookPointState("HATO");
  assert.equal(lookPoint.selectorWord, 0x8068);
  assert.equal(lookPoint.record.activeDword, 0);
  assert.deepEqual(
    calls.filter(call => call[0] === "look-point"),
    [
      ["look-point", "HATO", 15],
      ["look-point", "HATO", -16],
    ],
  );
  assert.equal(sceneState.readGlobalByte(), 1);
  assert.deepEqual(sceneState.readPrimaryRuntimeTransitionCallback(), {
    argument: 1,
    revision: 1,
  });
  assert.equal(
    sceneState.readPrimaryRuntimeState().currentEventPresent,
    false,
  );
  assert.deepEqual(sceneState.nativeOperation0166State.readControl(), {
    modeTwoControlDword: 1,
    modeEightControlDword: 1,
    modeTwoCleanupRequired: false,
  });
  assert.deepEqual(
    animation.requests.map(({ request }) => request),
    [903, 100, 1374, 1374],
  );
  assert.deepEqual(playerMotionRuntime.readControllerState(), {
    requestWord66: 100,
    parameter12c: 0,
    parameter130: 0,
    parameter134: -1,
    parameterDc: 1,
  });
  assert.equal(
    playerMotionRuntime.readMotionStatus({ actorCode: "AKIR" }),
    2,
  );
  assert.deepEqual(animation.releases, ["idle", "idle", "idle"]);
  assert.deepEqual(playerNativeTransform, {
    position: [
      -121.16000366210938,
      -1.7999999523162842,
      77.94000244140625,
    ].map(Math.fround),
    facingRaw: 42143,
  });
  assert.equal(sceneState.readActorXmptState("AKIR").state, 0);
  assert.deepEqual(
    calls.filter(call => call[0] === "camera-mode"),
    [["camera-mode", 0]],
  );
  assert.equal(cameraFrames.length > 1, true);
  assert.equal(cameraReleases, 1);
  assert.equal(eventCameraRuntime.readFrame(), null);
  assert.equal(stopped.length, 0);
});
