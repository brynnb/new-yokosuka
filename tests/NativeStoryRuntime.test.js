import assert from "node:assert/strict";
import test from "node:test";

import { NativeStoryRuntime } from "../play/scripts/NativeStoryRuntime.js";

function createRuntime() {
  const calls = [];
  const sceneState = {
    configureNativeOperation0120Records: value => calls.push(["clip", value]),
  };
  const runtime = new NativeStoryRuntime({
    dialoguePersistence: {
      gameplayState: () => ({
        dialogueState: "dialogue",
        persistentScriptBitState: "bits",
      }),
      hydrate: value => calls.push(["hydrate", value]),
      clear: () => calls.push("clear-persistence"),
    },
    dialogueOverlay: {
      update: value => calls.push(["overlay", value]),
      stop: reason => calls.push(["stop-dialogue", reason]),
      dispose: () => calls.push("dispose-dialogue"),
    },
    dialogueFaces: { update: value => calls.push(["faces", value]) },
    roomScripts: {
      sceneState,
      activateArea: area => calls.push(["activate", area]),
      deactivateArea: () => calls.push("deactivate"),
    },
    scriptedEvents: {
      status: "idle",
      cancel: reason => calls.push(["cancel", reason]),
      resetRoomControllers: () => calls.push("reset-rooms"),
      update: value => calls.push(["scripted", value]),
    },
    automaticEvents: {
      leaveArea: () => calls.push("leave-area"),
      update: value => calls.push(["automatic", value]),
    },
    eventController: {
      reset: reason => calls.push(["reset", reason]),
      update: value => calls.push(["controller", value]),
    },
    cutscenes: {
      active: false,
      ownsPlayerPresentation: false,
      stop: reason => calls.push(["stop-cutscene", reason]),
      clearWorld: id => calls.push(["clear-cutscene", id]),
      update: value => calls.push(["cutscene", value]),
      dispose: () => calls.push("dispose-cutscene"),
    },
    sceneResources: {
      register: value => calls.push(["resource", value]),
      clear: () => calls.push("clear-resources"),
    },
    mapClipState: {
      load: () => "records",
      clear: () => calls.push("clear-map-clip"),
    },
    mapRenderPreparation: {
      load: () => calls.push("prepare-map"),
      clear: () => calls.push("clear-map-preparation"),
    },
    mapLayerState: { load: () => calls.push("map-layer") },
    sceneLighting: { create: () => calls.push("lighting") },
    composeRoomScene: () => calls.push("compose"),
    getRoomComposition: () => ({ resources: ["phone", "drawer"] }),
    getGameDate: () => "date",
    getGameplayState: () => ({
      dialogueState: "dialogue",
      persistentScriptBitState: "bits",
    }),
    getActivityRunner: () => null,
    sendDiagnostic: value => calls.push(["diagnostic", value]),
  });
  return { calls, runtime };
}

test("story world activation and clearing preserve subsystem order", () => {
  const { calls, runtime } = createRuntime();
  const world = { id: "interior", nativeArea: "JOMO" };
  runtime.activateWorld(world, ["mesh"]);
  runtime.clearWorld(world);
  assert.deepEqual(calls, [
    ["activate", "JOMO"],
    "compose",
    ["resource", "phone"],
    ["resource", "drawer"],
    "map-layer",
    ["clip", "records"],
    "prepare-map",
    "lighting",
    ["stop-cutscene", "world-change"],
    ["stop-dialogue", "world-change"],
    "leave-area",
    ["reset", "world-change"],
    ["cancel", "world-change"],
    "reset-rooms",
    "deactivate",
    "clear-map-clip",
    "clear-map-preparation",
    "clear-resources",
    ["clear-cutscene", "interior"],
  ]);
});

test("automatic story updates receive one explicit native context", () => {
  const { calls, runtime } = createRuntime();
  runtime.updateAutomatic({
    world: { nativeArea: "D000" },
    enabled: true,
    playerPosition: "position",
    playerYaw: 1.5,
  });
  const update = calls[0][1];
  assert.equal(update.area, "D000");
  assert.equal(update.enabled, true);
  assert.deepEqual(update.context.nativeContext, {
    dialogueState: "dialogue",
    nativePersistentScriptBitState: "bits",
    gameDate: "date",
    playerPosition: "position",
    playerYaw: 1.5,
  });
});
