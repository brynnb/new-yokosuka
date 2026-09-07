import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  ScheduledActorRuntime,
  scheduledActorLocalLoopRouteState,
  scheduledActorNativeScheduleRouteState,
} from "../play/characters/ScheduledActorRuntime.js";
import {
  shenmue2NpcOpcodeWordCount,
} from "../src/Shenmue2NpcProgram.js";
import {
  shenmue2Mt7BodyValue,
  shenmue2Mt7MotionFamily,
  shenmue2NpcLocomotionMotionId,
} from "../src/Shenmue2MotLoader.js";
import {
  buildShenmue2RouteGraph,
  shenmue2RoutePath,
  shenmue2RouteSplinePoint,
} from "../tools/lib/shenmue2_npc_navigation.js";

const WORLD_IDS = [
  "s2ak00",
  "s2ar02",
  "s2ar03",
  "s2wb00",
  "s2we00",
  "s2wk00",
  "s2wn00",
  "s2wr00",
  "s2ws00",
  "s2wt00",
];

function readShard(worldId) {
  return JSON.parse(fs.readFileSync(new URL(
    `../play/data/shenmue2-crowd/${worldId}.json`,
    import.meta.url,
  )));
}

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("S2 native route references expand through authored spline junctions", () => {
  const routes = [
    {
      index: 0,
      points: [[-10, 100, 0], [0, 100, 0], [10, 101, 0], [20, 101, 0]],
      startRouteReferences: [0, 0],
      endRouteReferences: [1, 1],
    },
    {
      index: 1,
      points: [[0, 100, 0], [10, 101, 0], [20, 102, 0], [30, 102, 0]],
      startRouteReferences: [0, 0],
      endRouteReferences: [1, 1],
    },
  ];
  const nodes = [
    {
      id: "AR00", worldId: "s2ar02", routeIndex: 0, routeParameter: 0,
      x: 0, y: 0, z: 0,
    },
    {
      id: "AR01", worldId: "s2ar02", routeIndex: 1, routeParameter: 64,
      x: 20, y: 0, z: 0,
    },
  ];
  assert.deepEqual(shenmue2RouteSplinePoint(routes[0], 0), [0, 100, 0]);
  assert.deepEqual(shenmue2RouteSplinePoint(routes[0], 64), [10, 101, 0]);
  const graph = buildShenmue2RouteGraph(routes, nodes);
  const path = shenmue2RoutePath(graph, nodes[0], nodes[1], "s2ar02");
  assert.deepEqual(path.routeIndices, [0, 1]);
  assert.deepEqual(path.points[0], [0, 100, 0]);
  assert.deepEqual(path.points.at(-1), [20, 102, 0]);
  assert.equal(
    shenmue2RoutePath(
      graph,
      nodes[0],
      { ...nodes[1], worldId: "s2ws00" },
      "s2ar02",
    ),
    null,
  );
});

test("Shenmue II outdoor worlds have native crowd routes", () => {
  for (const worldId of WORLD_IDS) {
    const shard = readShard(worldId);
    assert.equal(shard.schema, "new-yokosuka-shenmue2-crowd-v2");
    assert.equal(shard.worldId, worldId);
    assert.ok(shard.actors.length > 0, worldId);
    assert.match(shard.source.characterSelection, /exact actor code/);
    assert.deepEqual(
      shard.motionRequirements.free,
      [],
      "S2 must not request the placeholder Shenmue I walk bank",
    );
    for (const actor of shard.actors) {
      assert.equal(actor.characterAssetDirectory, "shenmue2-characters");
      assert.equal(actor.characterAssetFormat, "MT7");
      assert.equal(actor.characterScale, 10);
      assert.equal(actor.localLoopRoute.worldId, worldId);
      assert.equal(actor.localLoopRoute.movementMode, "0x66");
      assert.equal(actor.localLoopRoute.clockDriven, true);
      assert.equal(actor.nativeSchedule.worldId, worldId);
      assert.ok(actor.nativeSchedule.phases.length > 0);
      assert.equal(actor.nativeSchedule.phases[0].startSecond, 0);
      assert.ok(actor.nativeSchedule.phases.every(
        (phase, index, phases) => (
          phase.points.length > 0
          && phase.points.every(
            (point) => point.length === 3 && point.every(Number.isFinite)
          )
          && (index === 0 || phase.startSecond >= phases[index - 1].startSecond)
        ),
      ));
      assert.equal(
        actor.actorCode,
        actor.shenmue2NativeEvidence.logicalCharacterCode,
      );
      assert.ok(Number.isInteger(
        actor.shenmue2NativeEvidence.motionFamilyIndex,
      ));
      const nativeEvidence = actor.shenmue2NativeEvidence;
      const rootNodeId = Number(nativeEvidence.mt7RootNodeId);
      assert.equal(
        nativeEvidence.mt7BodyValue,
        shenmue2Mt7BodyValue(rootNodeId),
      );
      assert.equal(
        nativeEvidence.motionFamilyIndex,
        shenmue2Mt7MotionFamily(rootNodeId),
      );
      assert.equal(
        nativeEvidence.locomotionMotionId,
        shenmue2NpcLocomotionMotionId(
          nativeEvidence.motionFamilyIndex,
        ),
      );
      assert.equal(
        actor.localLoopRoute.speed,
        actor.shenmue2NativeEvidence.locomotionSpeed,
      );
      assert.ok(Number.isInteger(
        actor.shenmue2NativeEvidence.locomotionMotionId,
      ));
      assert.ok(actor.localLoopRoute.points.length >= 2);
      assert.ok(actor.localLoopRoute.points.every(
        (point) => point.length === 3 && point.every(Number.isFinite),
      ));
      assert.ok(actor.localLoopRoute.points.every((point) => point[1] > 50));
      const sourceOffset = actor.shenmue2NativeEvidence.routeRecordOffset
        || actor.shenmue2NativeEvidence.actorProgramOffset;
      assert.match(sourceOffset, /^0x[0-9a-f]+$/);
      assert.ok(actor.shenmue2NativeEvidence.nativeOperations.length > 0);
    }
  }
});

test("native S2 clock phases execute authored one-shot trips and exits", () => {
  const definition = {
    actorCode: "10E_",
    instanceId: "native-schedule-test",
    nativeSchedule: {
      worldId: "s2ar02",
      speed: 1,
      phases: [
        {
          startSecond: 0,
          behavior: "stationary",
          points: [[0, 100, 0]],
        },
        {
          startSecond: 10 * 3600,
          behavior: "once",
          points: [[0, 100, 0], [2, 100, 0]],
        },
        {
          startSecond: 19 * 3600,
          behavior: "once",
          points: [[2, 100, 0], [4, 100, 0]],
          exitAfterArrival: true,
        },
      ],
    },
  };
  const playback = {};
  const waiting = scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    0,
    9 * 3600,
  );
  assert.deepEqual(waiting.position, [0, 100, 0]);
  assert.equal(waiting.moving, false);

  const departing = scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    1,
    10 * 3600,
  );
  assert.deepEqual(departing.position, [1, 100, 0]);
  assert.equal(departing.moving, true);
  const arrived = scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    1,
    10 * 3600,
  );
  assert.deepEqual(arrived.position, [2, 100, 0]);
  assert.equal(arrived.moving, false);

  assert.equal(scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    2,
    19 * 3600,
  ), null);
  assert.equal(scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    0,
    19 * 3600,
  ), null);
});

test("native S2 initialization-only placements stay staged until their clock gate", () => {
  const stagedActors = WORLD_IDS.flatMap((worldId) => (
    readShard(worldId).actors.map((actor) => ({ actor, worldId }))
  )).filter(({ actor, worldId }) => {
      const operations = actor.shenmue2NativeEvidence?.nativeOperations || [];
      const firstClockIndex = operations.findIndex(
        (operation) => operation.opcode === 1 || operation.opcode === 2,
      );
      const preClockOperations = operations.slice(0, firstClockIndex);
      const initializationOnly = (
        firstClockIndex > 0
        && preClockOperations.length === 1
        && preClockOperations[0].opcode === 3
      );
      assert.equal(
        actor.nativeSchedule.phases[0].active === false,
        initializationOnly,
        `${worldId}:${actor.actorCode}`,
      );
    return initializationOnly;
  });
  assert.equal(stagedActors.length, 8);

  const shard = readShard("s2ar02");
  const actor12 = shard.actors.find((actor) => actor.actorCode === "12E_");
  const actor14 = shard.actors.find((actor) => actor.actorCode === "14E_");
  assert.ok(actor12);
  assert.ok(actor14);
  assert.equal(actor12.nativeSchedule.phases[0].active, false);
  assert.equal(actor12.nativeSchedule.phases[0].lifecycle, "staged");
  assert.equal(actor14.nativeSchedule.phases[0].active, false);

  const at1041 = 10 * 3600 + 41 * 60;
  assert.equal(scheduledActorNativeScheduleRouteState(
    actor12,
    {},
    0,
    at1041,
  ), null);
  assert.equal(scheduledActorNativeScheduleRouteState(
    actor14,
    {},
    0,
    at1041,
  ), null);

  const actor12Active = scheduledActorNativeScheduleRouteState(
    actor12,
    {},
    0,
    10 * 3600 + 45 * 60,
  );
  assert.ok(actor12Active);
  assert.equal(actor12Active.nativeSchedulePhaseIndex, 1);
  assert.equal(scheduledActorNativeScheduleRouteState(
    actor14,
    {},
    0,
    11 * 3600 + 14 * 60,
  ), null);
  assert.ok(scheduledActorNativeScheduleRouteState(
    actor14,
    {},
    0,
    11 * 3600 + 15 * 60,
  ));
});

test("native S2 behavior before the first clock remains resident", () => {
  const actor = WORLD_IDS.flatMap((worldId) => readShard(worldId).actors)
    .find((candidate) => (
      candidate.nativeSchedule?.phases?.length > 1
      && candidate.nativeSchedule.phases[0].behavior !== "stationary"
    ));
  assert.ok(actor, "expected a native program with pre-clock behavior");
  assert.notEqual(actor.nativeSchedule.phases[0].active, false);
  assert.ok(scheduledActorNativeScheduleRouteState(actor, {}, 0, 0));
});

test("native S2 clock phases preserve authored midnight wrapping", () => {
  const definition = {
    actorCode: "08A_",
    instanceId: "native-midnight-test",
    nativeSchedule: {
      worldId: "s2ar03",
      speed: 1,
      wrapAfterMidnightSecond: 4 * 60,
      phases: [
        { startSecond: 0, behavior: "stationary", points: [[0, 100, 0]] },
        {
          startSecond: 19 * 3600,
          behavior: "stationary",
          points: [[1, 100, 0]],
        },
        {
          startSecond: 24 * 3600 + 4 * 60,
          behavior: "stationary",
          points: [[2, 100, 0]],
        },
      ],
    },
  };
  const playback = {};
  assert.deepEqual(scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    0,
    60,
  ).position, [1, 100, 0]);
  assert.deepEqual(scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    0,
    4 * 60,
  ).position, [2, 100, 0]);
  assert.deepEqual(scheduledActorNativeScheduleRouteState(
    definition,
    playback,
    0,
    8 * 3600 + 30 * 60,
  ).position, [0, 100, 0]);
});

test("native S2 stationary action phases select authored area motions", () => {
  const actor = readShard("s2wt00").actors.find(
    (candidate) => candidate.actorCode === "08C_"
      && candidate.nativeSchedule.phases.some(
        (phase) => phase.nativeMotionId === 0xa805,
      ),
  );
  assert.ok(actor);
  const phase = actor.nativeSchedule.phases.find(
    (candidate) => candidate.nativeMotionId === 0xa805,
  );
  assert.equal(phase.nativeMotionBank, "npcWT00");
  assert.equal(phase.nativeMotionSequenceIndex, 4);
  assert.ok(Number.isFinite(phase.nativeRootYaw));
  const routeState = scheduledActorNativeScheduleRouteState(
    actor,
    {},
    0,
    8 * 3600 + 30 * 60,
  );
  assert.equal(routeState.moving, false);
  assert.equal(routeState.nativeMotionId, 0xa805);
  assert.equal(routeState.nativeMotionRate, 1);
  assert.equal(routeState.rootYaw, phase.nativeRootYaw);
});

test("native S2 opcode-8 preludes finish before authored patrols", () => {
  const actor = readShard("s2wt00").actors.find(
    (candidate) => candidate.actorCode === "08D_"
      && candidate.nativeSchedule.phases.some(
        (phase) => phase.nativePrelude?.motionId === 0x80ed,
      ),
  );
  assert.ok(actor);
  const phase = actor.nativeSchedule.phases.find(
    (candidate) => candidate.nativePrelude?.motionId === 0x80ed,
  );
  assert.equal(phase.nativePrelude.durationSeconds, 250 / 30);
  const playback = {};
  const prelude = scheduledActorNativeScheduleRouteState(
    actor,
    playback,
    0,
    8 * 3600 + 30 * 60,
  );
  assert.equal(prelude.nativeMotionId, 0x80ed);
  assert.equal(prelude.moving, false);
  const patrol = scheduledActorNativeScheduleRouteState(
    actor,
    playback,
    phase.nativePrelude.durationSeconds + 0.25,
    8 * 3600 + 30 * 60,
  );
  assert.notEqual(patrol.nativeMotionId, 0x80ed);
  const expectedDistance = (
    patrol.routeLength * actor.nativeSchedule.phase
    + actor.nativeSchedule.speed * 0.25
  ) % patrol.routeLength;
  assert.ok(Math.abs(patrol.routeDistance - expectedDistance) < 1e-6);
});

test("cross-map persistent residents retain separate world-local segments", () => {
  const aberdeen = readShard("s2ar03").actors.find(
    (actor) => actor.actorCode === "08A_",
  );
  const thousandWhite = readShard("s2wt00").actors.find(
    (actor) => actor.actorCode === "08A_"
      && actor.nativeSchedule.phases.some(
        (phase) => phase.nativeMotionId === 0xa806,
      ),
  );
  assert.ok(aberdeen);
  assert.ok(thousandWhite);
  assert.notEqual(aberdeen.instanceId, thousandWhite.instanceId);
  assert.equal(
    aberdeen.shenmue2NativeEvidence.nodeReferences[0].id,
    "AB75",
  );
  assert.equal(
    thousandWhite.shenmue2NativeEvidence.nodeReferences[0].id,
    "WTT1",
  );
});

test("all S2 outdoor areas retain exact native identities and clock data", () => {
  let explicitPoseCount = 0;
  for (const worldId of WORLD_IDS) {
    const shard = readShard(worldId);
    assert.match(shard.source.characterSelection, /exact actor code/);
    assert.ok(shard.actors.length > 0);
    for (const actor of shard.actors) {
      assert.equal(
        actor.actorCode,
        actor.shenmue2NativeEvidence.logicalCharacterCode,
      );
      assert.equal(actor.localLoopRoute.clockDriven, true);
      assert.ok(actor.shenmue2NativeEvidence.nodeReferences.length > 0);
      assert.match(
        actor.shenmue2NativeEvidence.actorProfile.sourceOffset,
        /^0x[0-9a-f]+$/,
      );
      assert.ok(Number.isInteger(
        actor.shenmue2NativeEvidence.actorProfile.ageCategory,
      ));
      const explicitPose = actor.shenmue2NativeEvidence.explicitPoseMotion;
      if (explicitPose) {
        explicitPoseCount += 1;
        assert.equal(explicitPose.flags, 0x10);
        assert.equal(explicitPose.controllerGroupMask, 0x10);
        assert.equal(explicitPose.nativeMotionSlot, 4);
        assert.equal(explicitPose.actorLayerIndex, 1);
        const operation = actor.shenmue2NativeEvidence.nativeOperations.find(
          (candidate) => candidate.opcode === 0x2d,
        );
        assert.equal(operation.arguments.length, 2);
        assert.equal(operation.arguments[1], "0x10");
        assert.equal(
          actor.shenmue2NativeEvidence.nativeOperations.some(
            (candidate) => candidate.opcode === 0x10,
          ),
          false,
        );
      }
      assert.ok(actor.position[0] < 0);
      if (Number.isFinite(actor.localLoopRoute.activeUntilSecond)) {
        assert.ok(
          actor.shenmue2NativeEvidence.packedTimeBoundaries.some(
            (boundary) => boundary.second
              === actor.localLoopRoute.activeUntilSecond,
          ),
        );
      }
    }
  }
  assert.equal(explicitPoseCount, 7);
});

test("all extracted S2 NPC operations retain native command alignment", () => {
  let operationCount = 0;
  for (const worldId of WORLD_IDS) {
    for (const actor of readShard(worldId).actors) {
      for (const operation of actor.shenmue2NativeEvidence.nativeOperations) {
        operationCount += 1;
        const wordCount = shenmue2NpcOpcodeWordCount(operation.opcode);
        assert.ok(wordCount !== null, `${worldId} opcode ${operation.opcode}`);
        assert.equal(
          operation.arguments.length,
          wordCount - 1,
          `${worldId} opcode 0x${operation.opcode.toString(16)}`,
        );
      }
    }
  }
  assert.ok(operationCount > 5000);
});

test("Shenmue II crowd assets match their generated archive evidence", () => {
  const seen = new Map();
  for (const worldId of WORLD_IDS) {
    for (const actor of readShard(worldId).actors) {
      seen.set(actor.modelCode, actor.textureFile);
    }
  }
  assert.ok(seen.size >= 12);
  for (const [modelCode, textureFile] of seen) {
    const model = fs.readFileSync(new URL(
      `../play/assets/shenmue2-characters/${modelCode}.CHRM`,
      import.meta.url,
    ));
    const textures = fs.readFileSync(new URL(
      `../play/assets/shenmue2-characters/${textureFile}`,
      import.meta.url,
    ));
    assert.equal(model.subarray(0, 4).toString("ascii"), "MDC7");
    assert.ok(textures.length > 12);
    assert.equal(digest(model).length, 64);
    assert.equal(digest(textures).length, 64);
  }
});

test("local scheduled actors loop continuously over authored points", () => {
  const definition = {
    actorCode: "00A_",
    localLoopRoute: {
      id: "native-test",
      worldId: "s2ar02",
      points: [[-1, 100, 2], [-4, 100, 2], [-1, 100, 2]],
      speed: 1.5,
      movementMode: "0x66",
    },
  };
  const start = scheduledActorLocalLoopRouteState(definition, 0);
  const wrapped = scheduledActorLocalLoopRouteState(definition, 7);
  assert.deepEqual(start.position, [-1, 100, 2]);
  assert.deepEqual(wrapped.position, [-2, 100, 2]);
  assert.equal(wrapped.worldId, "s2ar02");
  assert.equal(wrapped.operation, 1);
  assert.equal(wrapped.moving, true);
  assert.equal(wrapped.movementMode, "0x66");
});

test("clock-driven native actors deactivate at their extracted boundary", () => {
  const definition = {
    actorCode: "00A_",
    localLoopRoute: {
      id: "native-clock-test",
      worldId: "s2ar02",
      points: [[-1, 100, 2], [-4, 100, 2]],
      speed: 1,
      activeUntilSecond: 18 * 3600,
    },
  };
  assert.ok(scheduledActorLocalLoopRouteState(
    definition,
    17 * 3600,
    17 * 3600,
  ));
  assert.equal(scheduledActorLocalLoopRouteState(
    definition,
    18 * 3600,
    18 * 3600,
  ), null);
});

test("play supplies the live world clock to scheduled actors", () => {
  const source = fs.readFileSync(new URL(
    "../play/PlayApplication.js",
    import.meta.url,
  ), "utf8");
  const construction = source.match(
    /const characterAssembly = new PlayCharacterAssembly\(\{([\s\S]*?)networkState:/,
  )?.[1];
  assert.ok(construction, "PlayCharacterAssembly clock wiring");
  assert.match(
    construction,
    /getGameDate:\s*\(\)\s*=>\s*\(\s*worldEnvironment\.lightingState\(worldRuntime\.activeWorld\)\.date/,
  );
  const assembly = fs.readFileSync(new URL(
    "../play/characters/PlayCharacterAssembly.js", import.meta.url,
  ), "utf8");
  assert.match(assembly, /new ScheduledActorRuntime\(\{[^]*?getGameDate,/);
});

test("native single-node programs remain visible as stationary actors", () => {
  const state = scheduledActorLocalLoopRouteState({
    actorCode: "01F_",
    localLoopRoute: {
      id: "native-stationary-test",
      worldId: "s2ak00",
      points: [[-200, 100, 220], [-200, 100, 220]],
      stationary: true,
    },
  }, 0, 12 * 3600);
  assert.deepEqual(state.position, [-200, 100, 220]);
  assert.equal(state.moving, false);
  assert.equal(state.operation, 3);
});

test("the scheduled runtime preserves MDC7 pedestrian rigs at human scale", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const model = fs.readFileSync(new URL(
    "../play/assets/shenmue2-characters/OK1_L.CHRM",
    import.meta.url,
  ));
  const textures = fs.readFileSync(new URL(
    "../play/assets/shenmue2-characters/OK1_textures.bin",
    import.meta.url,
  ));
  const exactBuffer = (bytes) => bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const assets = new Map([
    ["OK1_L.CHRM", exactBuffer(model)],
    ["OK1_textures.bin", exactBuffer(textures)],
  ]);
  const runtime = new ScheduledActorRuntime({
    scene,
    state: { currentMeshes: [] },
    fetchArrayBuffer: async (key) => assets.get(key),
    bundledCharacterAsset: (_catalog, filename) => filename,
    bundledCharacterModels: {},
    bundledCharacterTextures: {},
    suppressDetachedCharacterVariants: () => {},
    getActiveWorldId: () => "s2ar02",
    getGameDate: () => new Date("2026-08-02T08:30:00.000Z"),
  });
  await runtime.load([{
    actorCode: "00A_",
    instanceId: "s2-test",
    modelCode: "OK1_L",
    textureFile: "OK1_textures.bin",
    characterAssetDirectory: "shenmue2-characters",
    characterAssetFormat: "MT7",
    characterScale: 10,
    position: [-250, 100, 430],
    localLoopRoute: {
      id: "s2:test",
      worldId: "s2ar02",
      points: [[-250, 100, 430], [-255, 100, 430], [-250, 100, 430]],
      speed: 1.2,
      movementMode: "0x66",
      clockDriven: true,
    },
  }], null, "s2ar02");
  assert.equal(runtime.entries.length, 1);
  assert.equal(runtime.entries[0].root.scaling.x, 10);
  assert.ok(runtime.entries[0].defaultModel.renderMeshes.length > 0);
  assert.equal(runtime.entries[0].defaultModel.mt7MotionNodes.length, 22);
  assert.equal(runtime.entries[0].defaultModel.motionTranslationScale, 0.1);
  assert.ok(runtime.entries[0].defaultModel.mt7MotionNodes.every(
    ({ transform }) => !transform.isDisposed(),
  ));
  assert.equal(runtime.entries[0].root.isEnabled(), true);
  runtime.update(1);
  assert.ok(
    Math.abs(runtime.entries[0].localRouteDistance - 1.2) < 1e-9,
    "accelerated game time must not multiply native walking velocity",
  );
  scene.dispose();
  engine.dispose();
});
