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
  nativeClockRecordFromGameDate,
} from "../play/events/NativeClockRecordRuntime.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  createNativeSceneResourceRegistry,
} from "../play/events/NativeSceneResourceRegistry.js";
import {
  createNativeFreeConversationState,
} from "../play/events/NativeScriptedSceneRuntime.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";
import {
  createNativeAseqActivityRuntime,
} from "../play/events/NativeAseqActivityRuntime.js";
import {
  createNativeAseqPresentationRuntime,
} from "../play/events/NativeAseqPresentationRuntime.js";
import {
  dispatchNativeRoomSoundCommand,
} from "../play/events/NativeRoomSoundCommands.js";

const programPack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));
const drauthManifest = JSON.parse(readFileSync(new URL(
  "../play/assets/dobuita/drauth/manifest.json",
  import.meta.url,
)));
const drauthAudioManifest = JSON.parse(readFileSync(new URL(
  "../public/audio/world/drauth/manifest.json",
  import.meta.url,
)));

function eligibleSelectorHarness({
  executeEvent = false,
  operation0050 = null,
  scriptedScene = {},
} = {}) {
  const gameDate = new Date("1986-12-04T19:30:00.000Z");
  const dialogueState = createNativeDialogueState();
  const resourceRegistry = createNativeSceneResourceRegistry();
  const activities = [];
  const cameraModes = [];
  const mapRenderPreparations = [];
  dialogueState.write(2, 920, 1);
  dialogueState.write(2, 110, 0);
  dialogueState.write(2, 197, 1);
  const room = createNativeRoomScriptRuntime({
    operation0050: operation0050 || {
      startActivity: ({ slot, binding }) => {
        activities.push(["start", slot, binding]);
        return {
          activityId: "DRAUTH/SEQDATA1.AUTH",
          durationFrames: 2,
        };
      },
      updateActivity: update => {
        activities.push(["update", update.currentFrame]);
        return true;
      },
      stopActivity: ({ reason, activity }) => {
        activities.push(["stop", reason, activity.activityId]);
        return true;
      },
      rollbackActivity: reason => {
        activities.push(["rollback", reason]);
        return true;
      },
    },
    actorField: {
      resolveActorFieldState: ({ actorTag }) => ({
        actorAvailable: [
          "AKIR", "HRSK", "TONY", "SMTH", "HARY", "SERA", "JONZ",
        ].includes(actorTag),
      }),
      resolveObjectFieldState: ({ objectTag }) => ({
        actorAvailable: [
          "AKIR", "HRSK", "TONY", "SMTH", "HARY", "SERA", "JONZ",
        ].includes(objectTag),
      }),
    },
    actorController: {
      resolveActorControllerState: ({ actorTag }) => {
        const actorAvailable = [
          "AKIR", "HRSK", "TONY", "SMTH", "HARY", "SERA", "JONZ",
        ].includes(actorTag);
        return {
          actorAvailable,
          controllerAvailable: actorAvailable,
        };
      },
    },
    operation013c: resourceRegistry.adapter(),
    operation0170: {
      applyMapRenderPreparation: detail => (
        mapRenderPreparations.push(detail), true
      ),
    },
    associatedRecord: {
      resolveActorMomtByte6fState: ({ objectTag, query }) => (
        !query && [
          "AKIR", "HRSK", "TONY", "SMTH", "HARY", "SERA", "JONZ",
        ].includes(objectTag)
          ? { actorAvailable: true, momtAvailable: true }
          : null
      ),
    },
    clockRecord: {
      readNativeClockRecord: () => nativeClockRecordFromGameDate(gameDate),
    },
    scriptedScene: {
      selectCameraMode: detail => (cameraModes.push(detail), true),
      ...scriptedScene,
      freeConversationState: createNativeFreeConversationState({
        dialogueState,
      }),
    },
  });
  room.activateArea("D000");
  room.sceneState.configureNativeOperation0120Records(
    Array.from({ length: 32 }, (_, index) => ({
      word00: index === 0 ? 1 : 0,
      word08: index === 0 ? 1 : 0,
    })),
  );
  room.sceneState.writeNativeField({
    offset: 0xf8,
    width: 4,
    value: 450,
  });
  room.sceneState.writeNativeField({
    offset: 0xcc,
    width: 1,
    value: gameDate.getUTCHours(),
  });
  room.sceneState.writeNativeField({ offset: 0x400, width: 1, value: 0 });
  room.sceneState.writeNativeField({ offset: 0x105, width: 1, value: 0 });
  const eventActorTags = [
    "AKIR", "HRSK", "TONY", "SMTH", "HARY", "SERA", "JONZ",
  ];
  for (const objectTag of eventActorTags) {
    room.sceneState.configureObjectMapcRecord({
      objectTag,
      objectAvailable: true,
      recordAvailable: false,
    });
  }
  for (const objectTag of eventActorTags) {
    room.sceneState.configureActorMomtFlagState({
      objectTag,
      actorAvailable: true,
      momtAvailable: true,
      flagsWord: 0,
    });
  }
  for (const actorTag of eventActorTags) {
    room.sceneState.configureActorMhndState({
      actorTag,
      actorAvailable: true,
      controllerAvailable: false,
      recordAvailable: false,
      allocationAvailable: false,
    });
    room.sceneState.configureActorFaceClipControl({
      actorTag,
      actorAvailable: true,
      momtAvailable: true,
      faceAvailable: true,
      clipAvailable: true,
    });
  }
  room.writeSceneObjectBasePosition({
    objectTag: "AKIR",
    nativePosition: [20, 0, 30],
  });
  const stopped = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack,
    actorByteState: createNativeActorByteState(),
    createProbe: () => ({
      context: room.eventContext(),
      handlers: room.semanticHandlers(),
    }),
    ...(executeEvent ? {
      createExecution: detail => room.beginTransaction(detail),
    } : {}),
    onStopped: detail => stopped.push(detail),
  });
  return {
    room,
    runtime,
    stopped,
    activities,
    cameraModes,
    mapRenderPreparations,
  };
}

test("generated selector-18 gate reaches its authored spatial result", async () => {
  const { room, runtime } = eligibleSelectorHarness();
  const selected = runtime.automaticEvents.find(
    item => item.event.id === "d000-selector-18",
  );
  assert.ok(selected);
  const result = await runtime.evaluateAutomaticEventGate({
    area: "D000",
    selected,
    context: {},
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.returnValue, 18);
  assert.deepEqual(
    room.sceneState.readObjectVector("AKIR"),
    [20, 0, 30].map(nativeFloat32Word),
  );
});

test("selector 18 reaches its exact BGM013 command after DRAUTH", async () => {
  const music = [];
  let room;
  const harness = eligibleSelectorHarness({
    executeEvent: true,
    scriptedScene: {
      dispatchSoundCommand: detail => dispatchNativeRoomSoundCommand({
        ...detail,
        area: "D000",
        soundBankSlots: room.sceneState.readNativeSoundBankSlots(),
        playMusicTrack: trackId => (music.push(trackId), true),
      }),
    },
  });
  room = harness.room;
  assert.equal((await harness.runtime.pollAutomaticEvents({
    area: "D000",
    context: {},
  })).status, "yielded");
  for (
    let tick = 0;
    tick < 4096 && harness.runtime.status !== "stopped";
    tick += 1
  ) {
    if (harness.runtime.status === "continuation") {
      assert.equal(harness.runtime.update(1 / 30), true);
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(music, ["dobuita-selector-18"]);
  assert.equal(harness.runtime.status, "stopped");
  assert.deepEqual(harness.cameraModes, [{
    mode: 0,
    source: {
      functionFileOffset: "0x858c4",
      callFileOffset: "0x85dcc",
    },
  }]);
  assert.deepEqual(harness.mapRenderPreparations, [{
    selector: -1,
    mode: 0,
    source: {
      functionFileOffset: "0x85df0",
      callFileOffset: "0x85e06",
    },
  }]);
  assert.deepEqual(harness.stopped[0].reason.result.reason, {
    kind: "operation-stopped",
    semanticId: "indexed-controller-subsystem-reset",
    detail: "indexed-controller-presentation-adapter-missing",
  });
});

test("generated selector-18 advances through its exact AUTH activity", async () => {
  const { room, runtime, stopped, activities } = eligibleSelectorHarness({
    executeEvent: true,
  });
  const result = await runtime.pollAutomaticEvents({
    area: "D000",
    context: {},
  });
  assert.equal(result.status, "yielded", JSON.stringify(result));
  assert.deepEqual(room.sceneState.readNativeSoundBankSlots(), [
    null,
    null,
    "bgm013.snd",
    null,
    "a1_senfk.snd",
    "battle_1.snd",
    null,
    null,
  ]);
  assert.equal(
    room.sceneState.readNativeField({ offset: 0x0c201c40, width: 1 }),
    0x40,
  );
  assert.ok(room.sceneState.sceneEightChannelTransition);
  assert.equal(runtime.status, "continuation");

  for (
    let tick = 0;
    tick < 512 && runtime.status === "continuation";
    tick += 1
  ) {
    assert.equal(runtime.update(1 / 30), true);
    await new Promise(resolve => setImmediate(resolve));
  }
  for (
    let wait = 0;
    wait < 100 && runtime.status === "running";
    wait += 1
  ) {
    await new Promise(resolve => setImmediate(resolve));
  }

  assert.equal(
    room.sceneState.isSceneEightChannelTransitionActive(),
    false,
  );
  assert.equal(runtime.status, "stopped", JSON.stringify(stopped));
  assert.equal(stopped.length, 1);
  assert.deepEqual(activities.slice(0, 4), [
    ["start", 0, { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 }],
    ["update", 1],
    ["update", 2],
    ["stop", "complete", "DRAUTH/SEQDATA1.AUTH"],
  ]);
  assert.equal(
    stopped[0].reason.result.reason.kind,
    "operation-stopped",
    JSON.stringify(stopped[0].reason.result.reason),
  );
  assert.equal(
    stopped[0].reason.result.reason.semanticId,
    "sound-command-dispatch",
  );
  assert.equal(
    stopped[0].reason.result.reason.detail,
    "sound-command-adapter-missing",
  );
});

test("generated selector-18 runs the complete exact DRAUTH presentation runtime", async () => {
  const counts = { transforms: 0, motions: 0, cameras: 0, audio: 0 };
  const presentation = createNativeAseqPresentationRuntime({
    actors: {
      begin: () => true,
      applyTransform: () => (counts.transforms += 1, true),
      applyMotion: () => (counts.motions += 1, true),
      end: () => true,
    },
    camera: {
      begin: () => true,
      apply: () => (counts.cameras += 1, true),
      end: () => true,
    },
    audio: {
      begin: () => true,
      play: () => (counts.audio += 1, true),
      end: () => true,
    },
  });
  const activity = createNativeAseqActivityRuntime({
    manifest: drauthManifest,
    audioManifest: drauthAudioManifest,
    loadAsset: sourcePath => readFileSync(new URL(
      `../${sourcePath}`,
      import.meta.url,
    )),
    presentation,
  });
  const { runtime, stopped } = eligibleSelectorHarness({
    executeEvent: true,
    operation0050: {
      startActivity: detail => activity.startActivity(detail),
      updateActivity: detail => activity.updateActivity(detail),
      stopActivity: detail => activity.stopActivity(detail),
      rollbackActivity: reason => activity.rollbackActivity(reason),
    },
  });
  assert.equal((await runtime.pollAutomaticEvents({
    area: "D000",
    context: {},
  })).status, "yielded");
  for (
    let wait = 0;
    wait < 100 && runtime.status === "running";
    wait += 1
  ) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(runtime.status, "continuation");
  for (let tick = 0; tick < 4096 && runtime.status !== "stopped"; tick += 1) {
    if (runtime.status === "continuation") {
      assert.equal(runtime.update(1 / 30), true);
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(runtime.status, "stopped", JSON.stringify({ stopped, counts }));
  assert.equal(
    counts.transforms,
    1330 * 6 + 6,
    JSON.stringify(stopped),
  );
  assert.equal(counts.cameras, 1330 + 1);
  assert.ok(counts.motions > 1330);
  assert.equal(counts.audio, 44);
  assert.equal(
    stopped[0].reason.result.reason.semanticId,
    "sound-command-dispatch",
  );
});
