import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundaryTransitionDetector,
  OUTDOOR_BOUNDARY_TRANSITIONS,
  SAKURAGAOKA_BOUNDARY_TRANSITIONS,
  SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS,
  movementCrossesSource,
  pointInsideSource,
} from "../src/BoundaryTransitions.js";
import boundaryEvidence from
  "../tools/evidence/jd00-d000-boundary-transition.json"
  with { type: "json" };

function centerOf(transition) {
  const { origin, edgeA, edgeB } = transition.source.shape;
  return [
    origin[0] + (edgeA[0] + edgeB[0]) / 2,
    0,
    origin[1] + (edgeA[1] + edgeB[1]) / 2,
  ];
}

function portalCrossingPositions(transition) {
  const { left, right, approach } = transition.source.shape;
  const dx = right[0] - left[0];
  const dz = right[2] - left[2];
  const length = Math.hypot(dx, dz);
  const signedDistance = (
    dx * (approach[2] - left[2])
    - dz * (approach[0] - left[0])
  ) / length;
  const normalX = -dz / length;
  const normalZ = dx / length;
  return {
    approach: [...approach],
    beyond: [
      approach[0] - 2 * signedDistance * normalX,
      approach[1],
      approach[2] - 2 * signedDistance * normalZ,
    ],
  };
}

test("the manifest maps all three native EVNT IDs through their selector callbacks", () => {
  assert.deepEqual(
    boundaryEvidence.routes.map((route) => ({
      eventId: route.trigger.eventId,
      eventFlag: route.trigger.flagHex,
      selector: route.selectorValue,
      destination: `${route.destination.area}:${route.destination.entry}`,
    })),
    [
      {
        eventId: 2,
        eventFlag: "0x00040002",
        selector: 1,
        destination: "D000:1",
      },
      {
        eventId: 3,
        eventFlag: "0x00040003",
        selector: 2,
        destination: "D000:11",
      },
      {
        eventId: 1,
        eventFlag: "0x00040001",
        selector: 3,
        destination: "JU00:0",
      },
    ],
  );
});

test("Sakuragaoka consumes the three decoded parallelograms and destinations", () => {
  assert.deepEqual(
    SAKURAGAOKA_BOUNDARY_TRANSITIONS.map((transition) => ({
      eventId: transition.source.eventId,
      kind: transition.source.shape.kind,
      destination: [
        transition.destination.worldId,
        transition.destination.entry,
      ],
    })),
    [
      {
        eventId: 1,
        kind: "parallelogram",
        destination: ["yamanose", 0],
      },
      {
        eventId: 2,
        kind: "parallelogram",
        destination: ["dobuita", 1],
      },
      {
        eventId: 3,
        kind: "parallelogram",
        destination: ["dobuita", 11],
      },
    ],
  );
  assert.deepEqual(
    SAKURAGAOKA_BOUNDARY_TRANSITIONS[0].destination.browserSpawn.position,
    [23.8799991607666, 1.4900000095367432, 43.18000030517578],
  );
  assert.deepEqual(
    SAKURAGAOKA_BOUNDARY_TRANSITIONS[1].destination.browserSpawn.position,
    [-13.229999542236328, 0, 98.86000061035156],
  );
});

test("each decoded parallelogram includes its center and excludes nearby exterior points", () => {
  for (const transition of SAKURAGAOKA_BOUNDARY_TRANSITIONS) {
    const center = centerOf(transition);
    assert.equal(pointInsideSource(center, transition.source), true);
    assert.equal(
      pointInsideSource(
        [
          center[0] + transition.source.shape.edgeA[0] * 2
            + transition.source.shape.edgeB[0] * 2,
          0,
          center[2] + transition.source.shape.edgeA[1] * 2
            + transition.source.shape.edgeB[1] * 2,
        ],
        transition.source,
      ),
      false,
    );
  }
});

test("crossing a decoded volume produces its native destination once", () => {
  for (const transition of SAKURAGAOKA_BOUNDARY_TRANSITIONS) {
    const center = centerOf(transition);
    const detector = new BoundaryTransitionDetector(
      SAKURAGAOKA_BOUNDARY_TRANSITIONS,
    );
    detector.reset("sakuragaoka", [0, 0, 0]);
    assert.equal(detector.update("sakuragaoka", center), transition);
    assert.equal(detector.update("sakuragaoka", center), null);
  }
});

test("a frame step through a narrow native volume is still a crossing", () => {
  const transition = SAKURAGAOKA_BOUNDARY_TRANSITIONS[0];
  const center = centerOf(transition);
  const start = [center[0] + 10, 0, center[2]];
  const end = [center[0] - 10, 0, center[2]];
  assert.equal(
    movementCrossesSource(start, end, transition.source),
    true,
  );

  const detector = new BoundaryTransitionDetector(
    SAKURAGAOKA_BOUNDARY_TRANSITIONS,
  );
  detector.reset("sakuragaoka", start);
  assert.equal(detector.update("sakuragaoka", end), transition);
});

test("loading or spawning inside a decoded volume does not immediately warp", () => {
  const transition = SAKURAGAOKA_BOUNDARY_TRANSITIONS[0];
  const position = centerOf(transition);
  const detector = new BoundaryTransitionDetector(
    SAKURAGAOKA_BOUNDARY_TRANSITIONS,
  );

  detector.reset("sakuragaoka", position);
  assert.equal(detector.update("sakuragaoka", position), null);
  detector.update("sakuragaoka", [0, 0, 0]);
  assert.equal(detector.update("sakuragaoka", position), transition);
});

test("S2 traversal combines native FLDD exits and AREATBL door routes", () => {
  assert.equal(SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.length, 89);
  assert.deepEqual(
    SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS
      .filter((transition) => (
        transition.source.worldId === "s2ak00"
        && transition.evidence.kind
          === "shenmue2-fldd-exit-areatbl-destination"
      ))
      .map((transition) => ({
        destination: transition.destination.worldId,
        entry: transition.destination.entry,
        position: transition.destination.browserSpawn.position,
        yaw: transition.destination.browserSpawn.yaw,
        sourceOffset: transition.evidence.sourceControlFileOffset,
        routeOffset: transition.evidence.routeRecordFileOffset,
        destinationOffset: transition.evidence.destinationRecordFileOffset,
      })),
    [{
      destination: "s2ar02",
      entry: 2,
      position: [-242, 100.25, 317.6000061035156],
      yaw: 0,
      sourceOffset: "0x86d4",
      routeOffset: "0x0fd0",
      destinationOffset: "0x1510",
    }],
  );
});

test("S2 exterior and interior AREATBL door records form reciprocal routes", () => {
  const enter = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    ({ id }) => id === "s2-ar02-areatbl-88-to-ara0-1",
  );
  const leave = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    ({ id }) => id === "s2-ara0-areatbl-1-to-ar02-88",
  );

  assert.ok(enter);
  assert.ok(leave);
  assert.equal(enter.evidence.routeRecordFileOffset, "0x18d0");
  assert.equal(enter.evidence.destinationRecordFileOffset, "0x19f0");
  assert.equal(leave.evidence.routeRecordFileOffset, "0x19f0");
  assert.equal(leave.evidence.destinationRecordFileOffset, "0x18d0");
  assert.equal(enter.evidence.storyStateBypassed, true);
  assert.equal(enter.activation, "interaction");
  assert.deepEqual(
    enter.destination.browserSpawn.position,
    leave.source.shape.approach,
  );
  assert.deepEqual(
    leave.destination.browserSpawn.position,
    enter.source.shape.approach,
  );
});

test("S2 AREATBL doors require interaction instead of boundary crossing", () => {
  const transition = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    ({ id }) => id === "s2-ar02-areatbl-88-to-ara0-1",
  );
  const positions = portalCrossingPositions(transition);
  const detector = new BoundaryTransitionDetector(
    SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS,
  );
  detector.reset(transition.source.worldId, positions.approach);
  assert.equal(
    detector.update(transition.source.worldId, positions.beyond),
    null,
  );
});

test("Worker's Pier rooftop seam uses paired native FLDD controls both ways", () => {
  const enter = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    ({ id }) => id === "s2-ar02-fldd-exit-82-to-arsf-entry-1",
  );
  const leave = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    ({ id }) => id === "s2-arsf-fldd-exit-82-to-ar02-entry-83",
  );

  assert.ok(enter);
  assert.ok(leave);
  assert.deepEqual(
    enter.source.shape.approach,
    [-265.010986328125, 99.99500274658203, 340.0010070800781],
  );
  assert.equal(enter.evidence.sourceControlFileOffset, "0x153f4");
  assert.equal(leave.evidence.sourceControlFileOffset, "0x9eb0");
  assert.equal(enter.evidence.storyStateBypassed, true);
  assert.equal(enter.activation, "crossing");
});

test("Worker's Pier to Queen's uses the native FLDD exit control", () => {
  const transition = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    ({ id }) => id === "s2-ar02-fldd-exit-28-to-ar03-entry-28",
  );
  assert.ok(transition);
  assert.deepEqual(
    transition.source.shape.approach,
    [-272.9949951171875, 100, 455.5159912109375],
  );
  assert.equal(transition.evidence.sourceControlType, -2);
  assert.equal(transition.evidence.sourceControlValue, 29);
  assert.equal(transition.evidence.sourceControlFileOffset, "0x15324");
  assert.equal(transition.evidence.routeRecordFileOffset, "0x1670");
  assert.equal(transition.evidence.destinationRecordFileOffset, "0x1670");
});

test("S2 Fortune's Pier and Worker's Pier arrivals face into the new map", () => {
  const fortuneToWorkers = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    (transition) => (
      transition.source.worldId === "s2ak00"
      && transition.destination.worldId === "s2ar02"
    ),
  );
  const workersToFortune = SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS.find(
    (transition) => (
      transition.source.worldId === "s2ar02"
      && transition.destination.worldId === "s2ak00"
    ),
  );

  assert.equal(fortuneToWorkers.destination.browserSpawn.yaw, 0);
  assert.equal(workersToFortune.destination.browserSpawn.yaw, -Math.PI);
});

test("crossing each distinct S2 FLDD exit pose triggers exactly once", () => {
  const seenPoses = new Set();
  for (const transition of SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS) {
    if (transition.activation !== "crossing") continue;
    // A few native controls intentionally share a pose while selecting a
    // different story-state destination. The current free-roam runtime uses
    // the first catalog route at that pose until story-state routing exists.
    const poseKey = JSON.stringify([
      ...transition.source.shape.approach.map((value) => value.toFixed(2)),
      ...transition.source.shape.left.map((value) => value.toFixed(2)),
      ...transition.source.shape.right.map((value) => value.toFixed(2)),
    ]);
    if (seenPoses.has(poseKey)) continue;
    seenPoses.add(poseKey);
    const detector = new BoundaryTransitionDetector(
      SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS,
    );
    const { approach, left, right } = transition.source.shape;
    const midpoint = [
      (left[0] + right[0]) / 2,
      approach[1],
      (left[2] + right[2]) / 2,
    ];
    const beyond = [
      midpoint[0] + (midpoint[0] - approach[0]),
      approach[1],
      midpoint[2] + (midpoint[2] - approach[2]),
    ];

    detector.reset(transition.source.worldId, approach);
    assert.equal(
      detector.update(transition.source.worldId, approach),
      null,
      transition.id,
    );
    assert.equal(
      detector.update(transition.source.worldId, beyond),
      transition,
      transition.id,
    );
    assert.equal(
      detector.update(transition.source.worldId, beyond),
      null,
      transition.id,
    );
  }
});

test("spawning at an S2 arrival pose does not immediately return across the seam", () => {
  for (const transition of SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS) {
    const detector = new BoundaryTransitionDetector(
      SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS,
    );
    const arrival = transition.destination.browserSpawn.position;
    detector.reset(transition.destination.worldId, arrival);
    assert.equal(
      detector.update(transition.destination.worldId, arrival),
      null,
      transition.id,
    );
  }
});

test("the former hand-authored centers do not masquerade as source data", () => {
  const formerCenters = [
    [-40, 0, 3.5],
    [-20.12, 0, -40.78],
    [13, 1, 42],
  ];
  for (const position of formerCenters) {
    for (const transition of SAKURAGAOKA_BOUNDARY_TRANSITIONS) {
      assert.equal(
        pointInsideSource(position, transition.source),
        false,
      );
    }
  }
});

test("decoded volumes are inactive in every other world", () => {
  const detector = new BoundaryTransitionDetector(
    SAKURAGAOKA_BOUNDARY_TRANSITIONS,
  );
  detector.reset("dobuita", [0, 0, 0]);
  for (const transition of SAKURAGAOKA_BOUNDARY_TRANSITIONS) {
    assert.equal(
      detector.update("dobuita", centerOf(transition)),
      null,
    );
  }
});

test("the runtime uses all seven exact Disc 1 volumes with known entries", () => {
  assert.deepEqual(
    OUTDOOR_BOUNDARY_TRANSITIONS
      .filter((transition) => (
        transition.evidence.kind === "native-mapinfo-event-volume"
      ))
      .map((transition) => ({
      from: transition.source.worldId,
      eventId: transition.source.eventId,
      to: transition.destination.worldId,
      entry: transition.destination.entry,
      kind: transition.source.shape.kind,
    })),
    [
      {
        from: "dobuita",
        eventId: 2,
        to: "sakuragaoka",
        entry: 0,
        kind: "parallelogram",
      },
      {
        from: "dobuita",
        eventId: 3,
        to: "sakuragaoka",
        entry: 1,
        kind: "parallelogram",
      },
      {
        from: "dobuita",
        eventId: 5,
        to: "dcbn",
        entry: 0,
        kind: "parallelogram",
      },
      {
        from: "sakuragaoka",
        eventId: 1,
        to: "yamanose",
        entry: 0,
        kind: "parallelogram",
      },
      {
        from: "sakuragaoka",
        eventId: 2,
        to: "dobuita",
        entry: 1,
        kind: "parallelogram",
      },
      {
        from: "sakuragaoka",
        eventId: 3,
        to: "dobuita",
        entry: 11,
        kind: "parallelogram",
      },
      {
        from: "yamanose",
        eventId: 1,
        to: "sakuragaoka",
        entry: 2,
        kind: "parallelogram",
      },
    ],
  );
});

test("native outdoor entry headings use the controller's forward axis", () => {
  const dobuitaToSakuragaoka = OUTDOOR_BOUNDARY_TRANSITIONS.find(
    (transition) => (
      transition.id === "s1-d000-event-2-to-jd00-entry-0"
    ),
  );
  const sakuragaokaToYamanose = OUTDOOR_BOUNDARY_TRANSITIONS.find(
    (transition) => (
      transition.id === "s1-jd00-event-1-to-ju00-entry-0"
    ),
  );

  assert.equal(
    dobuitaToSakuragaoka.destination.browserSpawn.yaw,
    -Math.PI / 2 + Math.PI,
  );
  assert.equal(
    sakuragaokaToYamanose.destination.browserSpawn.yaw,
    -1.8784978259845972 + Math.PI,
  );
});

test("the measured Sakuragaoka dirt path restores its playable threshold", () => {
  const transition = OUTDOOR_BOUNDARY_TRANSITIONS.find(
    (candidate) => (
      candidate.id === "sakuragaoka-to-dobuita-dirt-path"
    ),
  );
  assert.ok(transition);
  assert.equal(transition.destination.worldId, "dobuita");
  assert.equal(transition.destination.entry, 11);
  assert.equal(transition.source.shape.kind, "directional-portal");

  const positions = portalCrossingPositions(transition);
  const detector = new BoundaryTransitionDetector(
    OUTDOOR_BOUNDARY_TRANSITIONS,
  );
  detector.reset("sakuragaoka", positions.approach);
  assert.equal(
    detector.update("sakuragaoka", positions.approach),
    null,
  );
  assert.equal(
    detector.update("sakuragaoka", positions.beyond),
    transition,
  );
});

test("every exact runtime volume triggers once when entered", () => {
  const exactTransitions = OUTDOOR_BOUNDARY_TRANSITIONS.filter(
    (transition) => (
      transition.source.shape.kind === "parallelogram"
    ),
  );
  for (const transition of exactTransitions) {
    const center = centerOf(transition);
    const detector = new BoundaryTransitionDetector();
    detector.reset(transition.source.worldId, [1000, 0, 1000]);
    assert.equal(
      detector.update(transition.source.worldId, center),
      transition,
    );
    assert.equal(detector.update(transition.source.worldId, center), null);
  }
});

test("exact runtime volumes are inactive in every other world", () => {
  const exactTransitions = OUTDOOR_BOUNDARY_TRANSITIONS.filter(
    (transition) => (
      transition.source.shape.kind === "parallelogram"
    ),
  );
  for (const transition of exactTransitions) {
    const center = centerOf(transition);
    const wrongWorld = new BoundaryTransitionDetector();
    wrongWorld.reset("exterior", [1000, 0, 1000]);
    assert.equal(wrongWorld.update("exterior", center), null);
  }
});
