import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";
import {
  ShenmueNineBallGame,
} from "@brynnb/lucky-break-engine";
import {
  MJQ_POOL_EQUIPMENT_PLACEMENTS,
  MJQ_POOL_INTERACTION,
  MJQ_POOL_TABLE_CENTER,
  MJQ_POOL_WORLD_ID,
} from "../play/config/pool.js";
import {
  applyLuckyBreakBallMaterialSettings,
  encodeLinearPanoramaForDisplay,
  isMjqRoomReflectionMesh,
  luckyBreakBallProbeConfig,
  LUCKY_BREAK_SHENMUE_BALL_MATERIAL,
  MJQ_POOL_REFLECTION_URL,
  MjqPoolRuntime,
  matchPoolBallRoots,
  poolAimingCameraPose,
  poolHorizontalRotationInput,
  poolKeyboardEventTargetsTextInput,
  poolWheelPowerDelta,
  poolWorldPosition,
} from "../play/pool/MjqPoolRuntime.js";
import {
  LuckyBreakCueController,
  luckyBreakCueLeadingSpace,
  luckyBreakStrokeTiming,
} from "../play/pool/LuckyBreakCueController.js";
import {
  createLuckyBreakBallShadow,
  LuckyBreakPoolVisuals,
  targetGuideFanWidth,
} from "../play/pool/LuckyBreakPoolVisuals.js";
import { WORLDS } from "../play/config/worlds.js";

test("constructing pool support outside MJQ does not load pool images or lighting", t => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  globalThis.Image = class { constructor() { throw new Error("eager image load"); } };
  t.after(() => {
    if (previousImage) Object.defineProperty(globalThis, "Image", previousImage);
    else delete globalThis.Image;
  });
  try {
    const runtime = new MjqPoolRuntime({scene, getWorldId: () => "dobuita",
      setMovementLocked() {}, dom: {}});
    assert.equal(runtime.ballLighting, null);
    assert.equal(runtime.normalMapPromise, null);
    assert.equal(runtime.pendingBallRoots, null);
    runtime.bind([]);
    assert.equal(runtime.ballLighting, null);
    runtime.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

function ballNode(name, x, z) {
  const minimum = new BABYLON.Vector3(x - 0.03, 0.75, z - 0.03);
  const maximum = new BABYLON.Vector3(x + 0.03, 0.81, z + 0.03);
  const geometry = {
    getTotalVertices: () => 120,
  };
  return {
    name,
    getChildren: () => [geometry],
    getHierarchyBoundingVectors: () => ({ minimum, maximum, min: minimum, max: maximum }),
  };
}

test("MJQ world loads native pool equipment and interaction metadata", () => {
  assert.equal(MJQ_POOL_WORLD_ID, "djaz");
  assert.equal(WORLDS.djaz.nativeArea, "DJAZ");
  assert.deepEqual(
    WORLDS.djaz.placements.slice(-2).map((placement) => placement.model),
    MJQ_POOL_EQUIPMENT_PLACEMENTS.map((placement) => placement.model),
  );
  assert.deepEqual(MJQ_POOL_INTERACTION.position, [
    MJQ_POOL_TABLE_CENTER[0],
    0.92,
    MJQ_POOL_TABLE_CENTER[2],
  ]);
});

test("native ball child nodes map to the shared engine rack numbers", () => {
  const localPositions = [
    [-1.11, 0],
    [0.756, 0],
    [0.80745, -0.030328],
    [0.80745, 0.030519],
    [0.858755, -0.061031],
    [0.858755, 0],
    [0.858755, 0.060857],
    [0.910205, -0.030328],
    [0.910205, 0.030519],
    [0.9619, 0],
  ];
  const children = localPositions.map(([x, z], index) => ballNode(
    `ball_${index}`,
    MJQ_POOL_TABLE_CENTER[0] + x,
    MJQ_POOL_TABLE_CENTER[2] + z,
  ));
  const root = {
    _filename: "S1_DJAZ_BOLK5DYG.MT5",
    getDescendants: () => children,
  };

  const matches = matchPoolBallRoots([root]);
  assert.equal(matches.size, 10);
  assert.deepEqual(
    [...matches.values()].sort((left, right) => left - right),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("native balls use Lucky Break's Shenmue material settings", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const ball = BABYLON.MeshBuilder.CreateSphere("ball", {}, scene);
  const original = new BABYLON.StandardMaterial("native_ball", scene);
  ball.material = original;

  applyLuckyBreakBallMaterialSettings(ball);

  assert.notEqual(ball.material, original);
  assert.equal(ball.material.getClassName(), "DynamicIBLMaterial");
  assert.equal(ball.material.roughness, 0);
  assert.deepEqual(
    ball.material.reflectivityColor.asArray(),
    Array(3).fill(LUCKY_BREAK_SHENMUE_BALL_MATERIAL.reflectivity),
  );
  assert.equal(ball.material.radianceLevel, 0.1);
  assert.equal(ball.material.irradianceLevel, 1);
  assert.equal(ball.material.toneMappingMode, 2);
  scene.dispose();
  engine.dispose();
});

test("Lucky Break reflection bounds are translated onto the MJQ table", () => {
  const config = luckyBreakBallProbeConfig();

  assert.deepEqual(config.aabbPosition, [
    MJQ_POOL_TABLE_CENTER[0],
    0.90625,
    MJQ_POOL_TABLE_CENTER[2],
  ]);
  assert.deepEqual(config.aabbSizeMin, [
    MJQ_POOL_TABLE_CENTER[0] - 2.2,
    0,
    MJQ_POOL_TABLE_CENTER[2] - 1.3,
  ]);
  assert.deepEqual(config.aabbSizeMax, [
    MJQ_POOL_TABLE_CENTER[0] + 2.2,
    1.74,
    MJQ_POOL_TABLE_CENTER[2] + 1.3,
  ]);
});

test("MJQ room reflection captures map geometry but not pool equipment", () => {
  const mapRoot = { _filename: "S1_DJAZ_MAP.MT5", parent: null };
  const mapMesh = { parent: mapRoot };
  const secondaryMapRoot = { _filename: "S3_DJAZ_MAP01.MT5", parent: null };
  const ballRoot = { _filename: "S1_DJAZ_BOLK5DYG.MT5", parent: null };
  const cueRoot = { _filename: "S1_DJAZ_CYUW1H1G.MT5", parent: null };

  assert.equal(isMjqRoomReflectionMesh(mapMesh), true);
  assert.equal(isMjqRoomReflectionMesh(secondaryMapRoot), true);
  assert.equal(isMjqRoomReflectionMesh(ballRoot), false);
  assert.equal(isMjqRoomReflectionMesh(cueRoot), false);
  assert.equal(
    MJQ_POOL_REFLECTION_URL,
    "/assets/pool/mjq-jazz-bar-pool-reflection.png?v=lbenv-348a6eeb",
  );
});

test("linear reflection pixels are display-encoded without changing alpha", () => {
  const encoded = encodeLinearPanoramaForDisplay(
    new Uint8Array([0, 128, 255, 77]),
  );

  assert.deepEqual([...encoded], [0, 188, 255, 77]);
});

test("pool reflection download is unavailable without the MJQ probe", async () => {
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    getWorldId: () => "d000",
    roomReflectionProbe: null,
  });
  assert.equal(await runtime.downloadRoomReflectionPanorama(), false);
});

test("engine-local ball positions translate onto the native MJQ table", () => {
  assert.deepEqual(
    poolWorldPosition({ x: -1.11, y: 0.78, z: 0 }),
    {
      x: MJQ_POOL_TABLE_CENTER[0] - 1.11,
      y: 0.78,
      z: MJQ_POOL_TABLE_CENTER[2],
    },
  );
  const game = new ShenmueNineBallGame();
  assert.equal(game.snapshot().balls.length, 10);
});

test("aiming camera uses Lucky Break's close down-cue view", () => {
  const pose = poolAimingCameraPose({ x: 10, z: 20 }, 0);
  assert.ok(Math.abs(pose.position.x - 9.59) < 1e-9);
  assert.ok(Math.abs(pose.position.y - 0.915) < 1e-9);
  assert.equal(pose.position.z, 20);
  assert.equal(pose.target.x, 10);
  assert.ok(Math.abs(pose.target.y - 0.78) < 1e-9);
  assert.equal(pose.target.z, 20);
});

test("lined-up aiming reverses horizontal rotation without changing standing movement", () => {
  assert.equal(poolHorizontalRotationInput(1, "standing"), 1);
  assert.equal(poolHorizontalRotationInput(-1, "standing"), -1);
  assert.equal(poolHorizontalRotationInput(1, "aiming"), -1);
  assert.equal(poolHorizontalRotationInput(-1, "aiming"), 1);
});

test("pool temporarily uses Lucky Break's close camera clipping distance", () => {
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    camera: { minZ: 0.25, fov: 0.8 },
    cameraMinZBeforePool: null,
    cameraFovBeforePool: null,
  });
  runtime.enablePoolCameraClipping();
  assert.equal(runtime.camera.minZ, 0.01);
  assert.equal(runtime.camera.fov, 0.9);
  runtime.restoreWorldCameraClipping();
  assert.equal(runtime.camera.minZ, 0.25);
  assert.equal(runtime.camera.fov, 0.8);
  assert.equal(runtime.cameraMinZBeforePool, null);
  assert.equal(runtime.cameraFovBeforePool, null);
});

test("wheel power uses Lucky Break's input direction", () => {
  assert.ok(poolWheelPowerDelta(100, 0) > 0);
  assert.ok(poolWheelPowerDelta(-100, 0) < 0);
});

test("pool keyboard controls yield to the focused chat input", () => {
  const input = {
    closest: () => input,
    matches: () => true,
  };
  assert.equal(
    poolKeyboardEventTargetsTextInput(
      { target: input },
      { activeElement: input },
    ),
    true,
  );
  let closed = false;
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    active: true,
    keys: new Set(["KeyA"]),
    getLeaveBinding: () => "KeyX",
    close: () => { closed = true; },
  });
  runtime.handleKeyDown({
    code: "KeyX",
    target: input,
    preventDefault: () => assert.fail("chat key was prevented"),
    stopImmediatePropagation: () => assert.fail("chat key was intercepted"),
  });
  assert.equal(closed, false);
  assert.equal(runtime.keys.size, 0);
});

test("target guide opens into Lucky Break's collision-angle fan", () => {
  assert.equal(targetGuideFanWidth(0.3, 0.015, 0), 0.015);
  assert.ok(targetGuideFanWidth(0.3, 0.015, 1) > 1.5);
});

test("changing power does not pull the resting cue away from the ball", () => {
  assert.equal(luckyBreakCueLeadingSpace(null), -0.015);
  const timing = luckyBreakStrokeTiming(1);
  assert.equal(luckyBreakCueLeadingSpace({
    elapsed: 0,
    timing,
    shot: { power: 1 },
  }), -0.015);
  assert.ok(luckyBreakCueLeadingSpace({
    elapsed: timing.pullbackDuration,
    timing,
    shot: { power: 1 },
  }) < -0.015);
});

test("side and top spin move Lucky Break's visible cue tip", () => {
  const controller = new LuckyBreakCueController();
  const cueBall = { position: { x: 0, y: 0.78, z: 0 } };
  controller.update({
    cueBall,
    aimAngle: 0,
    sideSpin: 0,
    topSpin: 0,
    strokeState: null,
  });
  const neutralTip = controller.kissPoint.clone();
  const neutralCenter = controller.centerPosition.clone();
  controller.update({
    cueBall,
    aimAngle: 0,
    sideSpin: 1,
    topSpin: 0,
    strokeState: null,
  });
  assert.notEqual(controller.kissPoint.z, neutralTip.z);
  assert.notEqual(controller.centerPosition.z, neutralCenter.z);
  controller.update({
    cueBall,
    aimAngle: 0,
    sideSpin: 0,
    topSpin: 1,
    strokeState: null,
  });
  assert.notEqual(controller.kissPoint.y, neutralTip.y);
  assert.notEqual(controller.centerPosition.y, neutralCenter.y);
});

test("a predicted target path renders as an orange fan", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const visuals = new LuckyBreakPoolVisuals(scene, [0, 0, 0]);
  const game = new ShenmueNineBallGame([{ id: "ryo", name: "Ryo" }]);
  const target = game.simulator.getBallAtIndex(1);
  target.position.x = -0.5;
  target.position.z = 0.05;
  game.simulator.save();

  visuals.updateAiming({
    game,
    snapshot: game.snapshot(),
    aimAngle: 0,
    power: 0.5,
    sideSpin: 0,
    topSpin: 0,
  });

  assert.equal(visuals.targetLine.isEnabled(), true);
  assert.deepEqual(
    visuals.targetLine.material.poolOverlayColor.asArray(),
    [237 / 255, 181 / 255, 30 / 255],
  );
  assert.equal(
    visuals.guideMeshes.every((mesh) => mesh.renderingGroupId === 0),
    true,
  );
  assert.equal(visuals.powerBar.renderingGroupId, 1);
  visuals.dispose();
  scene.dispose();
  engine.dispose();
});

test("Lucky Break ball shadows sit in the ball depth layer", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const shadow = createLuckyBreakBallShadow(scene);
  assert.equal(shadow.renderingGroupId, 0);
  assert.ok(Math.abs(shadow.position.y - 0.7505) < 1e-9);
  shadow.material.dispose();
  shadow.dispose();
  scene.dispose();
  engine.dispose();
});

test("the shared nine-ball engine supports NY's one-player practice mode", () => {
  const game = new ShenmueNineBallGame([{ id: "ryo", name: "Ryo" }]);
  assert.equal(game.players.length, 1);
  assert.equal(game.players[0].name, "Ryo");
  assert.equal(game.snapshot().phase, "ready");
});

test("the installed shared engine exposes the aiming prediction API", () => {
  const game = new ShenmueNineBallGame([{ id: "ryo", name: "Ryo" }]);
  assert.equal(typeof game.predictShot, "function");
  const prediction = game.predictShot({
    directionX: 1,
    directionZ: 0,
    power: 0.5,
    sideSpin: 0,
    topSpin: 0,
  });
  assert.ok(prediction);
});

test("opening cue-ball placement is enforced behind the head string", () => {
  const game = new ShenmueNineBallGame([{ id: "ryo", name: "Ryo" }]);
  const runtime = { game };
  const snapshot = game.snapshot();
  assert.equal(snapshot.openingBreak, true);
  assert.equal(
    MjqPoolRuntime.prototype.validPlacement.call(
      runtime,
      { localX: -0.5, localZ: 0 },
      snapshot,
    ),
    false,
  );
  assert.equal(game.placeCueBall(-0.5, 0), false);
  assert.equal(
    MjqPoolRuntime.prototype.validPlacement.call(
      runtime,
      { localX: -1.25, localZ: 0.2 },
      snapshot,
    ),
    true,
  );
  assert.equal(game.placeCueBall(-1.25, 0.2), true);
  const cueBall = game.snapshot().balls.find((ball) => ball.number === 0);
  assert.equal(cueBall.position.x, -1.25);
  assert.equal(cueBall.position.z, 0.2);
});

test("placement cursor follows the pointer while the rotating marker stays with the selected ball", () => {
  const cursor = {
    position: new BABYLON.Vector3(),
    enabled: false,
    valid: false,
    setEnabled(value) { this.enabled = value; },
    setValid(value) { this.valid = value; },
  };
  const marker = { position: new BABYLON.Vector3(1, 2, 3) };
  let position = {
    localX: -1.2,
    localZ: 0.1,
    world: new BABYLON.Vector3(8.8, 0.795, 20.1),
  };
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    viewMode: "placing",
    placementCursor: cursor,
    placementMarker: marker,
    placementSelected: true,
    placementValid: true,
    game: { placeCueBall: () => true },
    pointerTablePosition: () => position,
    validPlacement: () => true,
    syncPresentation: () => {},
    updateHud: () => {},
  });
  runtime.updatePlacementFromPointer({}, false);
  assert.equal(cursor.enabled, true);
  assert.equal(cursor.valid, true);
  assert.equal(cursor.position.x, 8.8);
  assert.deepEqual(marker.position.asArray(), [1, 2, 3]);

  runtime.updatePlacementFromPointer({}, true);
  assert.ok(Math.abs(marker.position.x - 8.8) < 1e-9);
  assert.ok(Math.abs(marker.position.y - 0.756) < 1e-9);
  assert.ok(Math.abs(marker.position.z - 20.1) < 1e-9);

  position = null;
  runtime.updatePlacementFromPointer({}, false);
  assert.equal(cursor.enabled, false);
});

test("dragging during cue-ball placement orbits instead of placing", () => {
  let commits = 0;
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    active: true,
    viewMode: "placing",
    camera: {
      position: new BABYLON.Vector3(0, 2, 2),
      setTarget() {},
    },
    cameraTarget: new BABYLON.Vector3(0, 0.75, 0),
    cameraTransition: null,
    canvas: {
      setPointerCapture() {},
      releasePointerCapture() {},
    },
    updatePlacementFromPointer(_event, commit) {
      if (commit) commits++;
    },
  });
  const down = {
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 100,
    preventDefault() {},
  };
  runtime.handlePointerDown(down);
  const before = runtime.camera.position.clone();
  runtime.handlePointerMove({
    pointerId: 7,
    clientX: 120,
    clientY: 110,
  });
  runtime.handlePointerUp({ pointerId: 7, clientX: 120, clientY: 110 });
  assert.equal(commits, 0);
  assert.equal(runtime.camera.position.equals(before), false);

  runtime.handlePointerDown({ ...down, pointerId: 8 });
  runtime.handlePointerUp({ pointerId: 8, clientX: 100, clientY: 100 });
  assert.equal(commits, 1);
});

test("the primary action moves from standing view into shot alignment", () => {
  let cameraChanges = 0;
  let hudChanges = 0;
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    viewMode: "standing",
    game: {
      snapshot: () => ({
        phase: "ready",
        winnerIndex: null,
        currentPlayerIndex: 0,
      }),
      players: [{ id: "ryo", name: "Ryo" }],
    },
    currentPlayer: () => ({ id: "ryo", name: "Ryo" }),
    setAimingCamera: () => {
      cameraChanges++;
    },
    updateHud: () => {
      hudChanges++;
    },
  });
  assert.equal(
    MjqPoolRuntime.prototype.primaryAction.call(runtime),
    true,
  );
  assert.equal(runtime.viewMode, "aiming");
  assert.equal(cameraChanges, 1);
  assert.equal(hudChanges, 1);
});

test("gamepad controls provide analog aim and pool-specific actions", () => {
  let hudChanges = 0;
  let cameraChanges = 0;
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    active: true,
    gamepadInput: { horizontal: 0, vertical: 0 },
    sideSpin: 0.7,
    topSpin: -0.4,
    lowView: false,
    viewMode: "aiming",
    updateHud: () => { hudChanges += 1; },
    updateCue: () => {},
    setAimingCamera: () => { cameraChanges += 1; },
  });
  runtime.setGamepadDirection(0.6, -0.5);
  assert.deepEqual(runtime.gamepadInput, {
    horizontal: 0.6,
    vertical: -0.5,
  });
  assert.equal(runtime.handleGamepadAction("resetSpin"), true);
  assert.equal(runtime.sideSpin, 0);
  assert.equal(runtime.topSpin, 0);
  assert.equal(runtime.handleGamepadAction("lowView"), true);
  assert.equal(runtime.lowView, true);
  assert.equal(hudChanges, 1);
  assert.equal(cameraChanges, 1);
});

test("shooting stages the cue stroke before launching physics", () => {
  let hudChanges = 0;
  const runtime = Object.assign(Object.create(MjqPoolRuntime.prototype), {
    viewMode: "aiming",
    strokeState: null,
    game: { snapshot: () => ({ phase: "ready" }) },
    updateHud: () => {
      hudChanges++;
    },
  });
  const shot = {
    directionX: 1,
    directionZ: 0,
    power: 0.5,
    sideSpin: 0,
    topSpin: 0,
  };
  assert.equal(runtime.queueShot(shot), true);
  assert.equal(runtime.viewMode, "stroking");
  assert.equal(runtime.strokeState.shot, shot);
  assert.equal(
    runtime.strokeState.contactTime,
    luckyBreakStrokeTiming(shot.power).contactTime,
  );
  assert.equal(hudChanges, 1);
  assert.equal(runtime.queueShot(shot), false);
});
