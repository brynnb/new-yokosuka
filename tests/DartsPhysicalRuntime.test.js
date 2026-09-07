import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  DART_BOARD_CENTERS,
  DartsPhysicalRuntime,
  dartAimAtTime,
  dartBoardIndexForInteraction,
  dartCabinetView,
} from "../play/arcade/DartsPhysicalRuntime.js";

test("physical darts chooses the clicked board", () => {
  assert.equal(
    dartBoardIndexForInteraction({ position: [-0.2, 0.9, -4.6] }),
    0,
  );
  assert.equal(
    dartBoardIndexForInteraction({ position: [-0.2, 0.9, -3.7] }),
    1,
  );
  const view = dartCabinetView({ position: [-0.2, 0.9, -3.7] });
  assert.deepEqual(view.center, DART_BOARD_CENTERS[1]);
  assert.deepEqual(view.frontNormal, [-1, 0, 0]);
});

test("physical and scoring darts use the same deterministic aim path", () => {
  assert.deepEqual(dartAimAtTime(0), {
    x: 0,
    y: Math.sin(0.8) * 0.72,
  });
  assert.deepEqual(dartAimAtTime(2.5), dartAimAtTime(2.5));
});

test("the physical dart stays square to the board and embeds until restart", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  let resetState = null;
  const roots = ["DRT1", "DRT2"].map((tag) => {
    const root = new BABYLON.TransformNode(tag, scene);
    root._runtimePlacementRecord = {
      model: "S3_DGCT_DARK310G.MT5",
      runtime: { objectTag: tag },
    };
    const mesh = BABYLON.MeshBuilder.CreateBox(
      `${tag}_mesh`,
      { size: 0.1 },
      scene,
    );
    mesh.material = new BABYLON.StandardMaterial(`${tag}_material`, scene);
    mesh.parent = root;
    return root;
  });
  const runtime = new DartsPhysicalRuntime({
    onStateChanged: (state) => {
      resetState = state;
    },
  });
  runtime.bind(roots);
  const state = {
    aimTime: 1,
    throwCooldown: 0,
    throwsLeft: 5,
    over: false,
  };
  assert.equal(
    runtime.start({ position: [-0.2, 0.9, -4.6] }, state),
    true,
  );
  const firstPosition = roots[0].position.clone();
  state.aimTime = 1.2;
  runtime.update(state);
  assert.equal(roots[0].position.x, firstPosition.x);
  assert.notEqual(roots[0].position.y, firstPosition.y);
  assert.ok(roots[0].rotationQuaternion.w > 0.999);
  assert.ok(Math.abs(roots[0].rotationQuaternion.y) < 0.001);

  runtime.noteThrow({ ...dartAimAtTime(state.aimTime) });
  state.throwCooldown = 0.42;
  state.throwsLeft = 4;
  runtime.update(state);
  assert.equal(runtime.bindings[0].landedRoots.length, 1);
  runtime.stop();
  assert.equal(runtime.bindings[0].landedRoots[0].isEnabled(), true);
  runtime.start({ position: [-0.2, 0.9, -4.6] }, state);
  assert.equal(runtime.bindings[0].landedRoots.length, 0);
  runtime.resetLiveDisplays({
    ...state,
    score: 123,
    timeBonus: 2,
    over: true,
    lastScore: 123,
    highScore: 456,
  });
  assert.equal(resetState.score, 0);
  assert.equal(resetState.timeBonus, 10);
  assert.equal(resetState.over, false);
  assert.equal(resetState.lastScore, 123);
  assert.equal(resetState.highScore, 456);

  runtime.restore();
  scene.dispose();
  engine.dispose();
});
