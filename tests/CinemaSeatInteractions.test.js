import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  CINEMA_SEAT_FACE_IDS,
  CINEMA_SEAT_EXIT_CLEARANCE,
  CINEMA_SEAT_EXIT_DISTANCE,
  CINEMA_SEAT_REFERENCE_NAME,
  CINEMA_SEAT_VERTICAL_OFFSET,
  CINEMA_SEAT_YAW_OFFSET,
  CinemaSeatInteractions,
  cinemaSeatSurfaceCenter,
} from "../play/interactions/CinemaSeatInteractions.js";

function createSeat(scene, name = "Seat.005") {
  const seat = new BABYLON.Mesh(name, scene);
  seat.setVerticesData(BABYLON.VertexBuffer.PositionKind, [
    -1, 0, -1,
    1, 0, -1,
    1, 0, 1,
    -1, 0, 1,
    0, -0.8, 0,
  ]);
  const indices = new Array((Math.max(...CINEMA_SEAT_FACE_IDS) + 1) * 3)
    .fill(0);
  for (const [index, faceId] of CINEMA_SEAT_FACE_IDS.entries()) {
    const triangles = index % 2 === 0 ? [0, 1, 2] : [0, 2, 3];
    indices.splice(faceId * 3, 3, ...triangles);
  }
  seat.setIndices(indices);
  seat.position.set(3, 0.8, -4);
  return seat;
}

test("cinema seat surface comes from the selected face range", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const seat = createSeat(scene);

  const center = cinemaSeatSurfaceCenter(seat);

  assert.ok(center.equalsWithEpsilon(new BABYLON.Vector3(3, 0.8, -4)));
  scene.dispose();
  engine.dispose();
});

test("the complete chair mesh enters and exits a seated interaction", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("__root__", scene);
  const screen = new BABYLON.TransformNode("Screen", scene);
  screen.parent = root;
  screen.position.set(0, 3, -7);
  const seat = createSeat(scene);
  seat.parent = root;
  const otherSeat = createSeat(scene, "Seat.006");
  otherSeat.position.set(-4, 0.8, -4);
  otherSeat.parent = root;
  const actorRoot = new BABYLON.TransformNode("actor", scene);
  actorRoot.position.set(2, 0, 0);
  actorRoot.rotation.y = 0.25;
  const resetCalls = [];
  const controller = {
    movementLocked: false,
    captureTravelState: () => ({ runToggled: true }),
    restoreTravelState: () => {},
    setMovementLocked(locked) {
      this.movementLocked = locked;
    },
    reset(position, yaw) {
      resetCalls.push({ position: position.clone(), yaw });
      actorRoot.position.copyFrom(position);
      actorRoot.rotation.y = yaw;
    },
  };
  let cleared = 0;
  const sitEmote = { id: "cinemaSit" };
  const runtime = new CinemaSeatInteractions({
    getController: () => controller,
    getActorRoot: () => actorRoot,
    playEmote: (emote) => emote === sitEmote,
    clearEmote: () => { cleared += 1; },
    sitEmote,
    setMetadata(target, property, value) {
      target.metadata = { ...(target.metadata || {}), [property]: value };
    },
  });

  const entries = runtime.register([root], "cinema");
  assert.equal(entries.length, 2);
  const referenceEntry = entries.find(
    ({ root: entryRoot }) => entryRoot.name === CINEMA_SEAT_REFERENCE_NAME,
  );
  const otherEntry = entries.find(({ root: entryRoot }) => (
    entryRoot === otherSeat
  ));
  assert.equal(seat.metadata.interactiveCinemaSeat, referenceEntry);
  assert.equal(otherSeat.metadata.interactiveCinemaSeat, otherEntry);
  assert.equal(otherEntry.yaw, referenceEntry.yaw);
  assert.equal(runtime.enter(referenceEntry), true);
  assert.equal(controller.movementLocked, true);
  assert.ok(actorRoot.position.equalsWithEpsilon(referenceEntry.position));
  assert.ok(Math.abs(referenceEntry.surfacePosition.y - 0.8) < 1e-6);
  assert.ok(
    Math.abs(referenceEntry.position.y - CINEMA_SEAT_VERTICAL_OFFSET) < 1e-6,
  );
  const screenFacingYaw = Math.atan2(
    screen.getAbsolutePosition().x - referenceEntry.position.x,
    screen.getAbsolutePosition().z - referenceEntry.position.z,
  );
  assert.ok(
    Math.abs(referenceEntry.yaw - (
      screenFacingYaw + CINEMA_SEAT_YAW_OFFSET
    )) < 1e-6,
  );
  assert.equal(runtime.exit(), true);
  assert.equal(controller.movementLocked, false);
  assert.ok(actorRoot.position.equalsWithEpsilon(referenceEntry.exitPosition));
  assert.ok(Math.abs(
    BABYLON.Vector3.Distance(
      new BABYLON.Vector3(
        referenceEntry.surfacePosition.x,
        0,
        referenceEntry.surfacePosition.z,
      ),
      new BABYLON.Vector3(
        referenceEntry.exitPosition.x,
        0,
        referenceEntry.exitPosition.z,
      ),
    ) - CINEMA_SEAT_EXIT_DISTANCE
  ) < 1e-6);
  assert.ok(Math.abs(
    referenceEntry.exitPosition.y - CINEMA_SEAT_EXIT_CLEARANCE
  ) < 1e-6);
  assert.equal(actorRoot.rotation.y, referenceEntry.exitYaw);
  assert.equal(resetCalls.length, 2);
  assert.equal(cleared, 1);
  scene.dispose();
  engine.dispose();
});
