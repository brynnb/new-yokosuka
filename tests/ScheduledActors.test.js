import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  advanceSecondaryRouteController,
  createSecondaryRouteController,
  initializeSecondaryRoute,
  nativeScheduleSelectorIndex,
  secondaryRoutePathStep,
  scheduledActorVariant,
  scheduledDescriptorState,
  scheduledJourneyState,
  stepSecondaryRoute,
} from "../tools/lib/ScheduledActorOfflineRuntime.js";
import {
  routeLength,
  sampleRoute,
} from "../src/RouteSampling.js";
import {
  scheduledActorModelCode,
} from "../src/ScheduledActorPresentation.js";

const manifest = JSON.parse(
  fs.readFileSync("play/data/scheduled-actors.json", "utf8"),
);
const catActor = manifest.actors.find((actor) => actor.actorCode === "CATB");
const catVariant = catActor.scheduleVariants.find(
  (variant) => (
    variant.scheduleVariantId === catActor.defaultScheduleVariantId
  ),
);
const cat = Object.freeze({
  ...catActor,
  ...catVariant,
  speed: catActor.nativeDefaultPathSpeedPerGameSecond,
});
const catRoute = cat.journeys.flatMap(
  (journey) => journey.routes,
).find((route) => route.points.length === 39).points;

test("CATB retains its exact native Yamanose route", () => {
  assert.equal(cat.actorCode, "CATB");
  assert.equal(cat.modelCode, "CT4_M");
  assert.equal(catRoute.length, 39);
  assert.deepEqual(catRoute[0], [
    45.56789779663086,
    7,
    98.13996887207031,
  ]);
  assert.deepEqual(catRoute.at(-1), [
    8.27548599243164,
    0.06193799898028374,
    34.242733001708984,
  ]);
  assert.ok(routeLength(catRoute) > 80);
});

test("route sampling preserves endpoints and travel direction", () => {
  const start = sampleRoute(catRoute, 0);
  const end = sampleRoute(catRoute, routeLength(catRoute));
  assert.deepEqual(start.position, catRoute[0]);
  assert.deepEqual(end.position, catRoute.at(-1));
  assert.ok(Number.isFinite(start.yaw));
  assert.ok(Number.isFinite(end.yaw));
});

test("secondary routes advance through nearby targets and snap at completion", () => {
  const points = [
    [0, 0, 0],
    [0.05, 0, 0],
    [1, 0, 0],
  ];
  assert.deepEqual(
    stepSecondaryRoute(points, [0, 0, 0], 0, 0.1),
    {
      position: [0.1, 0, 0],
      targetIndex: 2,
      completed: false,
    },
  );
  assert.deepEqual(
    stepSecondaryRoute(points, [0.95, 0, 0], 2, 0.1),
    {
      position: [1, 0, 0],
      targetIndex: 3,
      completed: true,
    },
  );
});

test("secondary route initialization preserves nearby shared-object state", () => {
  const points = [
    [0, 0, 0],
    [20, 0, 0],
  ];
  assert.deepEqual(
    initializeSecondaryRoute(points, [11, 0, 0]),
    {
      position: [0, 0, 0],
      targetIndex: 1,
      snapsToFirst: true,
      rootYaw: Math.PI * 1.5,
    },
  );
  assert.deepEqual(
    initializeSecondaryRoute(points, [9, 0, 0]),
    {
      position: [9, 0, 0],
      targetIndex: 0,
      snapsToFirst: false,
      rootYaw: Math.PI / 2,
    },
  );
});

test("negative forklift route control selects the native FK0 speed table", () => {
  assert.equal(
    secondaryRoutePathStep({
      secondaryObjectCode: "FK01",
      pathControlFloat: -20,
    }),
    0.18518516421318054,
  );
  assert.equal(
    secondaryRoutePathStep({
      secondaryObjectCode: "FK02",
      pathControlFloat: 20,
    }),
    0.18518516421318054,
  );
  assert.equal(
    secondaryRoutePathStep({
      secondaryObjectCode: "BIKE",
      pathControlFloat: -20,
    }),
    null,
  );
});

test("operation 0x24 preserves parked attachments across schedule blocks", () => {
  const definition = {
    actorCode: "RIDER",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [
      {
        startSecond: 8 * 3600,
        operations: [
          { operation: 8, area: "D000" },
          {
            operation: 0x24,
            secondaryObjectCode: "BIKE",
            enabled: true,
            browserVector: [4, 0, 7],
            transformControlWord: 0x4000,
          },
          { operation: 0 },
        ],
      },
      {
        startSecond: 9 * 3600,
        operations: [
          { operation: 8, area: "SHOP" },
          { operation: 3, browserPosition: [1, 0, 2], facingFixed: 0 },
          { operation: 4 },
        ],
      },
      {
        startSecond: 10 * 3600,
        operations: [
          { operation: 8, area: "D000" },
          {
            operation: 0x24,
            secondaryObjectCode: "BIKE",
            enabled: false,
          },
          { operation: 3, browserPosition: [4, 0, 7], facingFixed: 0 },
          { operation: 0 },
        ],
      },
    ],
  };
  const at = (hour, minute = 0) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 5, 9, hour, minute)),
    { D000: "dobuita", SHOP: "shop" },
  );

  assert.deepEqual(at(8, 30).secondaryAttachments, [{
    objectCode: "BIKE",
    area: "D000",
    position: [4, 0, 7],
    rootYaw: -Math.PI / 2,
    transformControlWord: 0x4000,
    sourceOffset: null,
  }]);
  assert.deepEqual(at(9, 30).secondaryAttachments, [{
    objectCode: "BIKE",
    area: "D000",
    position: [4, 0, 7],
    rootYaw: -Math.PI / 2,
    transformControlWord: 0x4000,
    sourceOffset: null,
  }]);
  assert.deepEqual(at(10, 30).secondaryAttachments, []);
});

test("secondary object programs advance from map residency at 30 Hz", () => {
  const operation = (objectCode, points) => ({
    operation: 0x1c,
    secondaryControlWord: 33511,
    secondaryObjectCode: objectCode,
    pathControlFloat: 20,
    secondaryRoute: { points },
  });
  const definition = {
    actorCode: "TEST",
    defaultArea: "MFSY",
    journeys: [
      {
        startSecond: 8 * 3600,
        areas: ["MFSY"],
        operations: [
          { operation: 8, area: "MFSY" },
          operation("FK01", [[0, 0, 0], [1, 0, 0]]),
          { operation: 0x24, secondaryObjectCode: "FK01", enabled: false },
          operation("FK02", [[1, 0, 0], [0, 0, 0]]),
          { operation: 0x24, secondaryObjectCode: "FK02", enabled: false },
          { operation: 4 },
        ],
      },
      {
        startSecond: 17 * 3600,
        areas: [],
        operations: [{ operation: 0 }],
      },
    ],
  };
  const atStart = new Date(Date.UTC(2000, 0, 1, 8, 1));
  const controller = createSecondaryRouteController(
    definition,
    atStart,
    { MFSY: "mfsy" },
  );
  assert.ok(controller);
  assert.equal(controller.worldId, "mfsy");
  assert.equal(controller.secondaryObjectCode, "FK01");
  assert.equal(controller.motionStateId, 33511);
  assert.deepEqual(controller.position, [0, 0, 0]);
  assert.equal(controller.targetIndex, 1);

  const advanced = advanceSecondaryRouteController(controller, 1);
  assert.ok(advanced);
  assert.equal(advanced.updateCount, 1);
  assert.equal(advanced.routeIndex, 0);
  assert.equal(advanced.targetIndex, 1);
  assert.ok(
    Math.abs(advanced.position[0] - 0.18518516421318054) < 1e-12,
  );
  assert.equal(advanced.moving, true);

  assert.equal(
    createSecondaryRouteController(
      definition,
      new Date(Date.UTC(2000, 0, 1, 17, 1)),
      { MFSY: "mfsy" },
    ),
    null,
  );
});

test("the compressed server day preserves real walking speed", () => {
  const atStart = scheduledJourneyState(
    cat,
    new Date(Date.UTC(1986, 5, 9, 10, 13, 0)),
    20 * 60 * 1000,
    manifest.areaWorlds,
  );
  const fiveRealSecondsLater = scheduledJourneyState(
    cat,
    new Date(Date.UTC(1986, 5, 9, 10, 19, 0)),
    20 * 60 * 1000,
    manifest.areaWorlds,
  );
  assert.deepEqual(atStart.position, catRoute[0]);
  assert.equal(atStart.worldId, "yamanose");
  assert.ok(
    Math.hypot(
      fiveRealSecondsLater.position[0] - atStart.position[0],
      fiveRealSecondsLater.position[1] - atStart.position[1],
      fiveRealSecondsLater.position[2] - atStart.position[2],
    ) > 0,
  );
});

test("CATB's native-speed schedule eventually moves into Dobuita", () => {
  const beforeWalk = scheduledDescriptorState(
    cat,
    new Date(Date.UTC(1986, 5, 9, 10, 12, 59)),
    manifest.areaWorlds,
    20 * 60 * 1000,
  );
  assert.equal(beforeWalk?.worldId, "yamanose");
  const later = scheduledDescriptorState(
    cat,
    new Date(Date.UTC(1986, 5, 9, 16, 0, 0)),
    manifest.areaWorlds,
    20 * 60 * 1000,
  );
  assert.equal(later?.worldId, "dobuita");
});

test("the reviewed inventory exposes authored routes for multiple NPCs", () => {
  assert.equal(manifest.summary.actorCodeCount, 225);
  assert.ok(manifest.summary.timetableEntryCount >= 1_000);
  assert.ok(manifest.summary.routeCount >= 1_500);
  const actorsWithYamanoseRoutes = manifest.actors.filter((actor) => (
    actor.scheduleVariants.some((variant) => (
      variant.journeys.some((journey) => journey.routes.some(
        (route) => route.area === "JU00",
      ))
    ))
  ));
  assert.ok(actorsWithYamanoseRoutes.length >= 6);
});

test("native path sampling advances at constant distance across waypoints", () => {
  const points = [[0, 0, 0], [3, 0, 0], [3, 0, 4]];
  assert.equal(routeLength(points), 7);
  assert.deepEqual(sampleRoute(points, 2).position, [2, 0, 0]);
  const secondSegment = sampleRoute(points, 4);
  assert.equal(secondSegment.position[0], 3);
  assert.equal(secondSegment.position[2], 1);
});

test("direct native actor-control operations remain available to runtime consumers", () => {
  const state = scheduledDescriptorState(
    {
      actorCode: "TEST",
      defaultArea: "D000",
      nativeDefaultPathSpeedPerGameSecond: 1,
      journeys: [{
        startSecond: 0,
        operations: [
          {
            operation: 0x03,
            browserPosition: [1, 0, 2],
            facingFixed: 0,
          },
          { operation: 0x0f, actorControlValue: 7 },
          { operation: 0x28, actorByteValue: 1 },
          { operation: 0x38, actorBooleanValue: 1 },
          { operation: 0x00 },
        ],
      }],
    },
    new Date(Date.UTC(1986, 5, 9, 12, 0, 0)),
    { D000: "dobuita" },
  );
  assert.equal(state.actorQueryState, 7);
  assert.equal(state.actorBooleanControllerMode, 1);
  assert.equal(state.actorBoundsControlMode, 1);
});

test("descriptor timing preserves static waits and native route overshoot", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultPathSpeedPerGameSecond: 1 / 30,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "JU00" },
        {
          operation: 3,
          browserPosition: [0, 0, 0],
          facingFixed: 0x4000,
        },
        { operation: 7, durationSeconds: 10 },
        {
          operation: 1,
          area: "JU00",
          movementMode: "0x8016",
          nativePathStepPerUpdate: 1 / 30,
          points: [[0, 0, 0], [3, 0, 0], [3, 0, 4]],
        },
        { operation: 4 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 0, second)),
    { JU00: "yamanose" },
  );
  assert.deepEqual(at(105).position, [0, 0, 0]);
  assert.equal(at(105).operation, 7);
  assert.deepEqual(at(112).position, [2, 0, 0]);
  assert.equal(at(112).moving, true);
  assert.equal(at(118).operation, 4);
  assert.deepEqual(at(118).position, [3, 0, 4]);
});

test("descriptor state preserves the native local-object lifecycle", () => {
  const localTransform = {
    objectCode: "ITEM",
    locationCode: "SO01",
    placementMode: 2,
    runtimePosition: [0.43519, -0.85081, 0.48438],
    browserPosition: [-0.43519, -0.85081, 0.48438],
    transformControlWords: [4733, 31675, 3822],
    resolvedModel: "S1_JHD0_HOUS501G.MT5",
  };
  const definition = {
    actorCode: "FUKU",
    defaultArea: "JHD0",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [
      {
        startSecond: 100,
        operations: [
          { operation: 8, area: "JHD0" },
          {
            operation: 3,
            browserPosition: [1, 0, 2],
            facingFixed: 0,
          },
          {
            operation: 0x10,
            fileOffset: "0x100",
            descriptorActivationSecond: 100,
            localTransform,
          },
          { operation: 7, durationSeconds: 50 },
        ],
      },
      {
        startSecond: 200,
        operations: [
          { operation: 8, area: "JHD0" },
          {
            operation: 3,
            browserPosition: [2, 0, 3],
            facingFixed: 0,
          },
          { operation: 7, durationSeconds: 50 },
        ],
      },
      {
        startSecond: 300,
        operations: [
          { operation: 8, area: "JHD0" },
          {
            operation: 3,
            browserPosition: [3, 0, 4],
            facingFixed: 0,
          },
          {
            operation: 0x11,
            objectCode: "ITEM",
            descriptorActivationSecond: 300,
          },
          { operation: 7, durationSeconds: 50 },
        ],
      },
    ],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { JHD0: "exterior" },
  );

  assert.deepEqual(at(110).localObjects, [{
    objectCode: "ITEM",
    locationCode: "SO01",
    area: "JHD0",
    placementMode: 2,
    runtimePosition: [0.43519, -0.85081, 0.48438],
    browserPosition: [-0.43519, -0.85081, 0.48438],
    transformControlWords: [4733, 31675, 3822],
    resolvedModel: "S1_JHD0_HOUS501G.MT5",
    sourceOffset: "0x100",
  }]);
  assert.equal(at(210).localObjects.length, 1);
  assert.deepEqual(at(310).localObjects, []);
});

test("descriptor routes preserve native speed under an accelerated game clock", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultPathSpeedPerGameSecond: 1 / 30,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 1,
          area: "D000",
          points: [[0, 0, 0], [100, 0, 0]],
        },
        { operation: 4 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 0, 115)),
    { D000: "dobuita" },
    96 * 60 * 1000,
  );

  // A 96-minute day advances the game clock 15 seconds per real second, but
  // the native 1/30-metre controller step still moves exactly 1 metre in that
  // real second.
  assert.deepEqual(state.position, [1, 0, 0]);
  assert.equal(state.moving, true);
});

test("descriptor route speed stays constant across a waypoint", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultPathSpeedPerGameSecond: 1 / 30,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 1,
          area: "D000",
          points: [[0, 0, 0], [3, 0, 0], [3, 0, 4]],
        },
        { operation: 4 },
      ],
    }],
  };
  const at = (milliseconds) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 1, 40, milliseconds)),
    { D000: "dobuita" },
  );

  assert.ok(Math.abs(at(2900).position[0] - 2.9) < 1e-12);
  assert.deepEqual(at(3000).position, [3, 0, 0]);
  assert.ok(Math.abs(at(3100).position[2] - 0.1) < 1e-12);
});

test("operation zero terminates traversal while retaining a proven transform", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "JU00" },
        {
          operation: 1,
          area: "JU00",
          points: [[0, 0, 0], [1, 0, 0]],
        },
        { operation: 0 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 1, 42)),
    { JU00: "yamanose" },
  );
  assert.deepEqual(state.position, [1, 0, 0]);
  assert.equal(state.operation, 0);
});

test("operation clears retain the last proven transform", () => {
  const definition = {
    actorCode: "TEST",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 0,
      operations: [
        {
          operation: 3,
          browserPosition: [10, 20, 30],
          facingFixed: 0x4000,
        },
        { operation: 5 },
        { operation: 0x13 },
        { operation: 0 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 12)),
    { D000: "dobuita" },
  );
  assert.deepEqual(state.position, [10, 20, 30]);
  assert.equal(state.area, "D000");
  assert.equal(state.worldId, "dobuita");
  assert.equal(state.operation, 0);
});

test("operation 0x30 preserves exact action-controller lifetime", () => {
  const definition = {
    actorCode: "TEST",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 0,
      operations: [
        {
          operation: 3,
          browserPosition: [10, 20, 30],
          facingFixed: 0,
        },
        {
          operation: 0x30,
          actionControllerId: 0x815e,
          actionControllerMode: 7,
        },
        { operation: 7, durationSeconds: 10 },
        {
          operation: 0x30,
          actionControllerId: 0,
          actionControllerMode: null,
        },
        { operation: 0 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { D000: "dobuita" },
  );
  assert.equal(at(5).actionControllerId, 0x815e);
  assert.equal(at(5).actionControllerMode, 7);
  assert.equal(at(5).operation, 7);
  assert.equal(at(10).actionControllerId, null);
  assert.equal(at(10).actionControllerMode, null);
  assert.equal(at(10).operation, 0);
  assert.deepEqual(at(10).position, [10, 20, 30]);
});

test("operation 0x2b preserves resident character selection", () => {
  const definition = {
    actorCode: "MIKI",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 0,
      operations: [
        {
          operation: 3,
          browserPosition: [10, 20, 30],
          facingFixed: 0,
        },
        {
          operation: 0x2b,
          residentCharacterCode: "MIK2",
          residentCharacterIndex: 203,
        },
        { operation: 0 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 12)),
    { D000: "dobuita" },
  );
  assert.equal(state.residentCharacterCode, "MIK2");
  assert.equal(state.residentCharacterIndex, 203);
  assert.deepEqual(state.position, [10, 20, 30]);
});

test("operation 0x2f model overrides persist across timetable entries", () => {
  const definition = {
    actorCode: "FUKU",
    modelCode: "FUK_M",
    modelOverrides: [{ modelCode: "FUB_M" }],
    defaultArea: "JHD0",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [
      {
        startSecond: 0,
        operations: [
          {
            operation: 3,
            browserPosition: [1, 2, 3],
            facingFixed: 0,
          },
          {
            operation: 0x2f,
            descriptorActivationSecond: 0,
            modelOverrideCode: "FUB_M",
            modelOverridePersistent: true,
          },
          { operation: 4 },
        ],
      },
      {
        startSecond: 100,
        operations: [
          {
            operation: 3,
            browserPosition: [4, 5, 6],
            facingFixed: 0,
          },
          { operation: 4 },
        ],
      },
      {
        startSecond: 200,
        operations: [
          {
            operation: 3,
            browserPosition: [7, 8, 9],
            facingFixed: 0,
          },
          {
            operation: 0x2f,
            descriptorActivationSecond: 200,
            modelOverrideCode: "FUK_M",
            modelOverridePersistent: false,
          },
          { operation: 4 },
        ],
      },
    ],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { JHD0: "exterior" },
  );
  assert.equal(at(50).modelOverrideCode, "FUB_M");
  assert.equal(at(150).modelOverrideCode, "FUB_M");
  assert.equal(scheduledActorModelCode(definition, at(150)), "FUB_M");
  assert.equal(at(250).modelOverrideCode, null);
  assert.equal(scheduledActorModelCode(definition, at(250)), "FUK_M");
  assert.equal(
    scheduledActorModelCode(definition, { modelOverrideCode: "UNKNOWN" }),
    "FUK_M",
  );
});

test("operation 0x19 installs and tears down its native motion request", () => {
  const definition = {
    actorCode: "FUKU",
    defaultArea: "JHD0",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 0,
      operations: [
        {
          operation: 3,
          browserPosition: [1, 2, 3],
          facingFixed: 0,
        },
        {
          operation: 0x19,
          motionStateId: -32013,
          motionStateControlWord: 33523,
        },
        { operation: 7, durationSeconds: 10 },
        {
          operation: 0x19,
          motionStateId: 0,
          motionStateControlWord: 0,
        },
        { operation: 7, durationSeconds: 10 },
        { operation: 4 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { JHD0: "exterior" },
  );
  assert.equal(at(5).motionStateId, -32013);
  assert.equal(at(15).motionStateId, null);
});

test("operation 0x22 blocks for a relative variable-motion duration", () => {
  const definition = {
    actorCode: "CATA",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 3,
          browserPosition: [1, 2, 3],
          facingFixed: 0,
        },
        {
          operation: 0x22,
          timeControlValue: -300,
          targetTimeMode: "relative duration",
          motionCandidateCount: 2,
          motionCandidates: [
            { motionStateId: 0x800c },
            { motionStateId: 0x800f },
          ],
        },
        {
          operation: 3,
          browserPosition: [4, 5, 6],
          facingFixed: 0,
        },
        { operation: 0 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { D000: "dobuita" },
  );
  const waiting = at(399);
  assert.equal(waiting.operation, 0x22);
  assert.equal(waiting.gateActivationSecond, 100);
  assert.equal(waiting.gateReleaseSecond, 400);
  assert.deepEqual(
    waiting.variableMotionGate.motionStateCandidates,
    [0x800c, 0x800f],
  );
  assert.equal(waiting.motionStateId, null);
  assert.deepEqual(waiting.position, [1, 2, 3]);
  assert.deepEqual(at(400).position, [4, 5, 6]);
});

test("operation 0x22 uses a nonnegative operand as an absolute target", () => {
  const definition = {
    actorCode: "NSMR",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 3,
          browserPosition: [1, 2, 3],
          facingFixed: 0,
        },
        {
          operation: 7,
          durationSeconds: 50,
        },
        {
          operation: 0x22,
          timeControlValue: 200,
          targetTimeMode: "absolute scheduler second",
          motionCandidateCount: 1,
          motionCandidates: [{ motionStateId: 0x8123 }],
          deterministicMotionStateId: 0x8123,
          variableMotionEvidence: {
            selectionStatus:
              "all candidates share one RNG-independent motion state",
          },
        },
        {
          operation: 3,
          browserPosition: [7, 8, 9],
          facingFixed: 0,
        },
        { operation: 0 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { D000: "dobuita" },
  );
  assert.equal(at(199).operation, 0x22);
  assert.equal(at(199).gateActivationSecond, 150);
  assert.equal(at(199).gateReleaseSecond, 200);
  assert.equal(at(199).motionStateId, 0x8123);
  assert.equal(
    at(199).variableMotionGate.deterministicMotionStateId,
    0x8123,
  );
  assert.match(
    at(199).variableMotionGate.selectionStatus,
    /RNG-independent/,
  );
  assert.deepEqual(at(200).position, [7, 8, 9]);
  assert.equal(at(200).motionStateId, 0x8123);

  definition.journeys[0].operations[2].durationSeconds = 150;
  assert.deepEqual(at(250).position, [7, 8, 9]);
});

test("operation 0x18 exposes a blocking linked-actor interaction", () => {
  const definition = {
    actorCode: "SNKC",
    defaultArea: "JHD0",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "JHD0" },
        {
          operation: 3,
          browserPosition: [1, 2, 3],
          facingFixed: 0,
        },
        {
          operation: 0x18,
          descriptorActivationSecond: 100,
          targetCode: "UOKT",
          targetSecond: 200,
          targetTimeMode: "absolute scheduler second",
          gateReleaseSecond: 250,
          interactionMotionStateIds: [0x815a, 0x8236, 0x810d],
          interactionControlValues: [0, 0, 0, 0],
          linkedInteractionEvidence: {
            targetBinding: {
              targetSubtype: 1,
              activeWindowStartSecond: 50,
              activeWindowEndSecond: 250,
            },
          },
        },
        {
          operation: 3,
          browserPosition: [4, 5, 6],
          facingFixed: 0,
        },
        { operation: 0 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
    { JHD0: "exterior" },
  );
  const waiting = at(249);
  assert.equal(waiting.operation, 0x18);
  assert.equal(waiting.gateReleaseSecond, 250);
  assert.equal(waiting.linkedInteraction.targetCode, "UOKT");
  assert.deepEqual(
    waiting.linkedInteraction.motionStateCandidates,
    [0x815a, 0x8236, 0x810d],
  );
  assert.deepEqual(waiting.position, [1, 2, 3]);
  assert.deepEqual(at(250).position, [4, 5, 6]);
});

test("operation 0x18 fails closed without a proven release time", () => {
  const definition = {
    actorCode: "TEST",
    defaultArea: "JHD0",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 0,
      operations: [
        { operation: 8, area: "JHD0" },
        {
          operation: 3,
          browserPosition: [1, 2, 3],
          facingFixed: 0,
        },
        {
          operation: 0x18,
          targetCode: "NONE",
          gateReleaseSecond: null,
        },
        { operation: 0 },
      ],
    }],
  };
  assert.equal(
    scheduledDescriptorState(
      definition,
      new Date(Date.UTC(2000, 0, 1, 0, 1)),
      { JHD0: "exterior" },
    ),
    null,
  );
});

test("an enabled secondary attachment establishes mirrored actor placement", () => {
  const definition = {
    actorCode: "FLD7",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 30600,
      operations: [
        { operation: 8, area: "MFSY" },
        {
          operation: 0x24,
          secondaryObjectCode: "FK01",
          browserVector: [-40.04, 0, 88.6],
          transformControlWord: 0x2000,
          enabled: true,
        },
        { operation: 0 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2000, 0, 1, 8, 31)),
    { MFSY: "mfsy" },
  );
  assert.deepEqual(state.position, [-40.04, 0, 88.6]);
  assert.equal(state.rootYaw, -Math.PI / 4);
  assert.equal(state.worldId, "mfsy");
});

test("timed variable records block traversal until their native activation", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 0,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 0x16,
          targetCode: "MAJ1",
          activationSecond: 10800,
          minimumDelaySeconds: 300,
        },
        {
          operation: 3,
          browserPosition: [4, 5, 6],
          facingFixed: 0,
        },
        { operation: 4 },
      ],
    }],
  };
  const at = (hour, second = 0) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, hour, 0, second)),
    { D000: "dobuita" },
  );
  assert.equal(at(2), null);
  assert.deepEqual(at(3).position, [4, 5, 6]);
  assert.equal(at(3).operation, 4);
});

test("operation 0x16 exposes a proven claimed leaf while its gate waits", () => {
  const definition = {
    actorCode: "TEST",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 3600,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 0x16,
          targetCode: "MAJ1",
          activationSecond: 10800,
          minimumDelaySeconds: 300,
          waitingPlacement: {
            status:
              "capture-proven deterministic exact-operation waiting leaf",
            leafIndex: 25,
            transformControlWord: 0x4000,
            position: [-1, 2, 3],
          },
          linkedPlacement: {
            position: [-4, 5, 6],
          },
          subordinateStream: {
            records: [{ operation: 0x07, durationSeconds: 300 }],
          },
          subordinateRuntimeEvidence: {
            runtimeEvidence:
              "tools/evidence/scheduled-actor-subordinate-evidence.json",
          },
        },
        { operation: 4 },
      ],
    }],
  };
  const at = (hour) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, hour)),
    { D000: "dobuita" },
  );
  const waiting = at(2);
  assert.equal(waiting.operation, 0x16);
  assert.deepEqual(waiting.position, [-1, 2, 3]);
  assert.equal(waiting.rootYaw, -Math.PI / 2);
  assert.equal(waiting.operation16Controller.phase, "gate-waiting");
  assert.equal(
    waiting.operation16Controller.waitingPlacement.leafIndex,
    25,
  );
  assert.equal(
    waiting.operation16Controller.subordinateStream.records[0].operation,
    0x07,
  );
  assert.match(
    waiting.operation16Controller.replayStatus,
    /capture-proven waiting leaf/,
  );
  const released = at(3);
  assert.equal(released.operation, 4);
  assert.deepEqual(released.position, [-4, 5, 6]);
});

test("native story flags select the exact program pointer-table slot", () => {
  const selector = {
    pointerSlots: [
      { selectorIndex: 0, rawSchedulePointer: "0x10c" },
      { selectorIndex: 1, rawSchedulePointer: "0x10c" },
      { selectorIndex: 2, rawSchedulePointer: "0x10c" },
      { selectorIndex: 3, rawSchedulePointer: "0x10c" },
      { selectorIndex: 4, rawSchedulePointer: "0x9fc" },
    ],
    conditions: [{
      requiredSetFlags: [20],
      requiredClearFlags: [100],
      startMonth: 0,
      startDay: 0,
      endMonth: 0,
      endDay: 0,
      requiredBaseSelector: -1,
      targetSelectorIndex: 4,
    }],
  };
  assert.equal(nativeScheduleSelectorIndex(selector), 1);
  assert.equal(nativeScheduleSelectorIndex(selector, {
    baseSelector: 4,
  }), 1);
  assert.equal(nativeScheduleSelectorIndex(selector, {
    storyFlags: [20],
  }), 4);
  assert.equal(nativeScheduleSelectorIndex(selector, {
    storyFlags: [20, 100],
  }), 1);
});

test("schedule variant selection preserves the observed default without flags", () => {
  const definition = {
    defaultScheduleVariantId: "observed",
    scheduleSelector: {
      pointerSlots: [
        { selectorIndex: 1, rawSchedulePointer: "0x10c" },
        { selectorIndex: 4, rawSchedulePointer: "0x9fc" },
      ],
      conditions: [{
        requiredSetFlags: [20],
        requiredClearFlags: [],
        startMonth: 0,
        startDay: 0,
        endMonth: 0,
        endDay: 0,
        requiredBaseSelector: -1,
        targetSelectorIndex: 4,
      }],
    },
    scheduleVariants: [
      { scheduleVariantId: "observed", selectorIndices: [1] },
      { scheduleVariantId: "story", selectorIndices: [4] },
    ],
  };
  assert.equal(
    scheduledActorVariant(definition, new Date()).scheduleVariantId,
    "observed",
  );
  assert.equal(
    scheduledActorVariant(definition, new Date(), {
      storyFlags: [20],
    }).scheduleVariantId,
    "story",
  );
});
