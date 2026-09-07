import assert from "node:assert/strict";
import test from "node:test";

import {
  ScheduledActorNetworkState,
} from "../play/characters/ScheduledActorNetworkState.js";

function definition() {
  return {
    instanceId: "TEST:one",
    journeys: [{
      startSecond: 100,
      operations: [{
        operation: 1,
        routeId: "TEST:one:100:0x10",
        points: [
          [0, 0, 0],
          [0, 0, 10],
        ],
      }],
    }],
  };
}

test("compact render routes configure authoritative projection", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([{
    instanceId: "TEST:compact",
    routes: [{
      id: "TEST:compact:route",
      points: [[0, 0, 0], [0, 0, 10]],
    }],
  }]);
  network.upsert({
    id: "TEST:compact",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:compact:route",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: now,
  });
  now += 2_000;
  assert.equal(network.stateFor("TEST:compact").z, 2);
});

test("compact render route aliases resolve shared geometry", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([{
    instanceId: "TEST:compact",
    routes: [{
      id: "TEST:compact:default",
      aliases: ["TEST:compact:variant"],
      points: [[0, 0, 0], [0, 0, 10]],
    }],
  }]);
  network.upsert({
    id: "TEST:compact",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:compact:variant",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: now,
  });
  now += 2_000;
  assert.equal(network.stateFor("TEST:compact").z, 2);
});

test("actor query state is read by exact identity and resident world", () => {
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => 10_000,
    getDayLengthMs: () => 86_400_000,
  });
  network.upsert({
    id: "HATO:one",
    actorCode: "HATO",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    revision: 1,
    updatedAt: 10_000,
    visual: { actorQueryState: 7 },
  });
  network.upsert({
    id: "HATO:other-world",
    actorCode: "HATO",
    worldId: "harbor",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    revision: 1,
    updatedAt: 10_000,
    visual: { actorQueryState: 12 },
  });
  assert.equal(
    network.actorQueryStateForActorCode("HATO", "dobuita"),
    7,
  );
  assert.equal(
    network.actorQueryStateForActorCode("HATO", "harbor"),
    12,
  );
  assert.equal(network.actorQueryStateForActorCode("HATO"), null);
  assert.equal(network.actorQueryStateForActorCode("NOPE", "dobuita"), null);
});

test("authoritative walking state projects between server corrections", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  assert.equal(network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: 10_000,
  }), true);
  now += 2_000;
  const projected = network.stateFor("TEST:one");
  assert.equal(projected.z, 2);
  assert.equal(projected.effectiveSecond, 102);
  assert.equal(projected.movementElapsedRealSeconds, 2);
  assert.equal(projected.movementSpeedMetersPerRealSecond, 1);
});

test("projection follows each actor's observed server progress", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  const state = {
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: now,
  };
  network.upsert(state);

  now = 12_000;
  network.upsert({
    ...state,
    z: 1,
    routeDistance: 1,
    revision: 2,
    updatedAt: now,
  });

  now = 13_000;
  const projected = network.stateFor("TEST:one");
  assert.equal(projected.routeDistance, 1.5);
  assert.equal(projected.movementSpeedMetersPerRealSecond, 0.5);
  assert.equal(projected.movementElapsedRealSeconds, 3);
});

test("live NPC speed tuning changes travel without speeding up animation", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: now,
  });
  now += 2_000;
  assert.equal(network.stateFor("TEST:one").routeDistance, 2);
  assert.equal(network.setWalkingSpeedMultiplier(1.5), true);
  assert.equal(network.stateFor("TEST:one").routeDistance, 2);

  now += 2_000;
  const tuned = network.stateFor("TEST:one");
  assert.equal(tuned.routeDistance, 5);
  assert.equal(tuned.movementElapsedRealSeconds, 4);
  assert.equal(tuned.walkingSpeedMultiplier, 1.5);

  assert.equal(network.setWalkingSpeedMultiplier(1), true);
  const reset = network.stateFor("TEST:one");
  assert.equal(reset.routeDistance, 4);
  assert.equal(reset.walkingSpeedMultiplier, 1);
});

test("same-route server corrections reconcile without a visual teleport", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: now,
  });
  now += 2_000;
  assert.equal(network.stateFor("TEST:one").routeDistance, 2);

  network.upsert({
    ...network.states.get("TEST:one"),
    routeDistance: 1.5,
    revision: 2,
    updatedAt: now,
  });
  assert.equal(network.stateFor("TEST:one").routeDistance, 2);

  now += 500;
  assert.equal(network.stateFor("TEST:one").routeDistance, 2.125);
  now += 500;
  assert.equal(network.stateFor("TEST:one").routeDistance, 2.25);
});

test("a same-route blocked update also reconciles without teleporting", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: now,
  });
  now += 2_000;
  assert.equal(network.stateFor("TEST:one").routeDistance, 2);

  network.upsert({
    ...network.states.get("TEST:one"),
    mode: "blocked",
    routeDistance: 1.5,
    revision: 2,
    updatedAt: now,
  });
  assert.equal(network.stateFor("TEST:one").routeDistance, 2);
  now += 500;
  assert.equal(network.stateFor("TEST:one").routeDistance, 1.75);
  now += 500;
  assert.equal(network.stateFor("TEST:one").routeDistance, 1.5);
});

test("blocked state remains fixed and rejects stale revisions", () => {
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => 20_000,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  const blocked = {
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 4,
    yaw: 0,
    mode: "blocked",
    routeId: "TEST:one:100:0x10",
    routeDistance: 4,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 104,
    revision: 2,
    updatedAt: 10_000,
  };
  assert.equal(network.upsert(blocked), true);
  assert.equal(network.upsert({ ...blocked, revision: 1, z: 9 }), false);
  assert.equal(network.stateFor("TEST:one").z, 4);
});

test("walking projection preserves the server avoidance offset", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 1,
    y: 0,
    z: 0,
    yaw: 0,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    avoiding: true,
    avoidanceOffsetX: 1,
    avoidanceOffsetZ: 0,
    revision: 1,
    updatedAt: 10_000,
  });
  now += 2_000;
  const projected = network.stateFor("TEST:one");
  assert.equal(projected.x, 1);
  assert.equal(projected.z, 2);
});

test("sidestep projection walks laterally without advancing the route", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 0,
    yaw: 1.25,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 0,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    avoidancePhase: "sidestep",
    avoidanceOffsetX: 0,
    avoidanceOffsetZ: 0,
    avoidanceTargetX: 1,
    avoidanceTargetZ: 0,
    avoidanceSpeed: 1,
    avoidanceMotionTime: 0,
    revision: 1,
    updatedAt: 10_000,
  });
  now += 500;
  const projected = network.stateFor("TEST:one");
  assert.equal(projected.x, 0.5);
  assert.equal(projected.z, 0);
  assert.equal(projected.yaw, 1.25);
  assert.equal(projected.routeDistance, 0);
  assert.equal(projected.effectiveSecond, 100);
  assert.equal(projected.movementElapsedRealSeconds, 0.5);
  assert.equal(projected.movementSpeedMetersPerRealSecond, 1);
});

test("return projection walks toward the route while advancing forward", () => {
  let now = 10_000;
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => now,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  network.upsert({
    id: "TEST:one",
    worldId: "dobuita",
    x: 1,
    y: 0,
    z: 4,
    yaw: -1.25,
    mode: "walking",
    routeId: "TEST:one:100:0x10",
    routeDistance: 4,
    routeLength: 10,
    speedPerGameSecond: 1,
    effectiveSecond: 104,
    avoidancePhase: "returning",
    avoidanceOffsetX: 1,
    avoidanceOffsetZ: 0,
    avoidanceTargetX: 1,
    avoidanceTargetZ: 0,
    avoidanceSpeed: 1,
    revision: 1,
    updatedAt: 10_000,
  });
  now += 500;
  const projected = network.stateFor("TEST:one");
  assert.equal(projected.x, 0.5);
  assert.equal(projected.z, 4.5);
  assert.equal(projected.yaw, -1.25);
  assert.equal(projected.routeDistance, 4.5);
  assert.equal(projected.effectiveSecond, 104.5);
});

test("reconnect snapshots replace stale revisions cleanly", () => {
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => 10_000,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([definition()]);
  const state = {
    id: "TEST:one",
    worldId: "dobuita",
    x: 0,
    y: 0,
    z: 4,
    yaw: 0,
    mode: "waiting",
    revision: 20,
    updatedAt: 10_000,
  };
  network.replaceSnapshot("dobuita", [state]);
  network.clear();
  network.replaceSnapshot("dobuita", [{
    ...state,
    revision: 3,
    z: 7,
  }]);
  assert.equal(network.stateFor("TEST:one").z, 7);
  assert.equal(network.stateFor("TEST:one").revision, 3);
});

test("secondary handoff routes project without a client-side snap", () => {
  const network = new ScheduledActorNetworkState({
    getServerWallTimeMs: () => 11_000,
    getDayLengthMs: () => 86_400_000,
  });
  network.configure([{
    instanceId: "FORK:test",
    journeys: [{
      operations: [{
        operation: 0x1c,
        routeId: "FORK:route",
        secondaryRoute: { points: [[0, 0, 0], [0, 0, 5]] },
        secondaryHandoff: {
          routeId: "FORK:handoff",
          points: [[0, 0, 5], [2, 0, 5]],
        },
      }],
    }],
  }]);
  network.upsert({
    id: "FORK:test",
    worldId: "mfsy",
    x: 0,
    y: 0,
    z: 5,
    yaw: 0,
    mode: "walking",
    routeId: "FORK:handoff",
    routeDistance: 0,
    routeLength: 2,
    speedPerGameSecond: 1,
    effectiveSecond: 100,
    revision: 1,
    updatedAt: 10_000,
  });
  const projected = network.stateFor("FORK:test");
  assert.equal(projected.x, 1);
  assert.equal(projected.z, 5);
});
