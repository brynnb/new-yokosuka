import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  createNativeAseqBabylonActors,
  createNativeAseqBabylonCamera,
} from "../play/events/NativeAseqBabylonPresentation.js";

test("AUTH Babylon actors own exact roots and restore the player on rollback", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const playerRoot = new BABYLON.TransformNode("player", scene);
    playerRoot.position.set(1, 2, 3);
    const playerRenderRoot = new BABYLON.TransformNode("player-render", scene);
    playerRenderRoot.parent = playerRoot;
    const smithRoot = new BABYLON.TransformNode("smith", scene);
    const smithModel = {
      root: smithRoot,
      renderRoot: smithRoot,
      loader: { characterContentRoot: () => smithRoot },
      latestControllerFamily: { nodes: [{ index: 0, type: 12 }] },
      latestControllerMatrices: [new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        1, 2, 3, 1,
      ])],
    };
    const calls = [];
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => ({
        root: playerRoot,
        renderRoot: playerRenderRoot,
        loader: {},
        modelCode: null,
      }),
      syncPlayerTransform: () => calls.push(["sync"]),
      scheduledActors: {
        beginActivityActors: (owner, codes) => {
          calls.push(["begin-scheduled", owner, codes]);
          return [{
            actorCode: "SMTH",
            instanceId: "smith-d000",
            root: smithRoot,
            model: smithModel,
          }];
        },
        activityActor() {},
        endActivityActors: owner => (
          calls.push(["end-scheduled", owner]), true
        ),
      },
      motionRuntime: {
        applyActivitySequence: (model, motion) => (
          calls.push(["motion", model, motion]), true
        ),
      },
      playerYawOffsetRadians: Math.PI,
    });
    const owner = {};
    assert.equal(runtime.begin(owner, ["AKIR", "SMTH"]), true);
    assert.equal(runtime.applyTransform(owner, "AKIR", {
      x: 10,
      y: 20,
      z: 30,
      rotationX: 0,
      rotationY: 90,
      rotationZ: 0,
    }), true);
    assert.deepEqual(
      [playerRoot.position.x, playerRoot.position.y, playerRoot.position.z],
      [-10, 20, 30],
    );
    const playerForward = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.Z,
      playerRoot.computeWorldMatrix(true),
    );
    assert.ok(Math.abs(playerForward.x - 1) < 1e-6);
    assert.ok(Math.abs(playerForward.z) < 1e-6);
    const motion = { sequence: {}, frame: 25 };
    assert.equal(runtime.applyMotion(owner, "SMTH", motion), true);
    assert.equal(calls.find(call => call[0] === "motion")[1], smithModel);
    assert.equal(runtime.activeActor("SMTH").model, smithModel);
    assert.equal(runtime.applyTransform(owner, "SMTH", {
      x: 4,
      y: 5,
      z: 6,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    }), true);
    assert.equal(runtime.end(owner, "transaction-rollback"), true);
    assert.equal(runtime.activeActor("SMTH"), null);
    assert.equal(runtime.componentWorldPosition("SMTH", -1), null);
    assert.equal(runtime.componentWorldPosition("SMTH", 12), null);
    assert.equal(runtime.componentWorldPosition("SMTH", 13), null);
    assert.deepEqual(
      [playerRoot.position.x, playerRoot.position.y, playerRoot.position.z],
      [1, 2, 3],
    );
    assert.ok(calls.some(call => call[0] === "end-scheduled"));
    assert.equal(runtime.resetPresentationState(), true);
    assert.equal(runtime.componentWorldPosition("SMTH", -1), null);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH Babylon actors lend the player model to a declared authored alias", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("player", scene);
    const renderRoot = new BABYLON.TransformNode("player-render", scene);
    renderRoot.parent = root;
    const player = { root, renderRoot, loader: {} };
    let scheduled = false;
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => player,
      syncPlayerTransform() {},
      scheduledActors: {
        beginActivityActors() { scheduled = true; return []; },
        activityActor() {},
        endActivityActors() { return true; },
      },
      motionRuntime: {
        applyActivitySequence: model => (
          model.root === player.root && model.loader === player.loader
        ),
      },
      playerActorAliases: ["AKID"],
    });
    const owner = {};
    assert.equal(runtime.begin(owner, ["AKID"]), true);
    assert.equal(runtime.activeActor("AKID").root, root);
    assert.equal(runtime.activeActor("AKID").model.loader, player.loader);
    assert.equal(runtime.activeActor("AKIR"), null);
    assert.equal(runtime.applyMotion(owner, "AKID", { sequence: {} }), true);
    assert.equal(scheduled, false);
    assert.equal(runtime.end(owner, "complete"), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH shots without the player hide only the gameplay render hierarchy", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const playerRoot = new BABYLON.TransformNode("player", scene);
    const playerRenderRoot = new BABYLON.TransformNode("player-render", scene);
    playerRenderRoot.parent = playerRoot;
    const shenhuaRoot = new BABYLON.TransformNode("shenhua", scene);
    const player = { root: playerRoot, renderRoot: playerRenderRoot, loader: {} };
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => player,
      syncPlayerTransform() {},
      scheduledActors: {
        beginActivityActors: (_owner, tags) => tags.map(actorCode => ({
          actorCode,
          root: shenhuaRoot,
          model: { root: shenhuaRoot },
        })),
        activityActor() {},
        endActivityActors: () => true,
      },
      motionRuntime: { applyActivitySequence: () => true },
      requirePlayer: false,
    });
    const owner = {};
    assert.equal(runtime.begin(owner, ["SINF"]), true);
    assert.equal(playerRoot.isEnabled(), true, "physics root stays available");
    assert.equal(playerRenderRoot.isEnabled(), false);
    assert.equal(runtime.end(owner, "complete"), true);
    assert.equal(playerRenderRoot.isEnabled(), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH Babylon camera reflects native X and restores prior ownership", () => {
  const camera = {
    position: new BABYLON.Vector3(1, 2, 3),
    rotation: new BABYLON.Vector3(0.1, 0.2, 0.3),
    upVector: new BABYLON.Vector3(0, 1, 0),
    fov: 0.8,
    minZ: 0.25,
    target: null,
    setTarget(value) { this.target = value; },
  };
  const runtime = createNativeAseqBabylonCamera(camera);
  const owner = {};
  assert.equal(runtime.begin(owner), true);
  assert.equal(camera.minZ, 0.02);
  assert.equal(runtime.apply(owner, {
    positionX: 4,
    positionY: 5,
    positionZ: 6,
    targetX: 7,
    targetY: 8,
    targetZ: 9,
    roll: 10,
    perspective: 60,
  }), true);
  assert.deepEqual(camera.position.asArray(), [-4, 5, 6]);
  assert.deepEqual(camera.target.asArray(), [-7, 8, 9]);
  assert.equal(camera.rotation.z, 0);
  const forward = camera.target.subtract(camera.position).normalize();
  const levelUp = BABYLON.Axis.Y.subtract(
    forward.scale(BABYLON.Vector3.Dot(BABYLON.Axis.Y, forward)),
  ).normalize();
  const screenUp = camera.upVector.subtract(
    forward.scale(BABYLON.Vector3.Dot(camera.upVector, forward)),
  ).normalize();
  const appliedRoll = Math.atan2(
    BABYLON.Vector3.Dot(BABYLON.Vector3.Cross(levelUp, screenUp), forward),
    BABYLON.Vector3.Dot(levelUp, screenUp),
  );
  assert.ok(Math.abs(appliedRoll - (-10 * Math.PI / 180)) < 1e-8);
  assert.equal(camera.fov, Math.PI / 3);
  assert.equal(runtime.end(owner), true);
  assert.deepEqual(camera.position.asArray(), [1, 2, 3]);
  assert.deepEqual(camera.rotation.asArray(), [0.1, 0.2, 0.3]);
  assert.deepEqual(camera.upVector.asArray(), [0, 1, 0]);
  assert.equal(camera.fov, 0.8);
  assert.equal(camera.minZ, 0.25);
});

test("AUTH Babylon camera retains cinematic framing across a sequence program", () => {
  const camera = {
    position: new BABYLON.Vector3(1, 2, 3),
    rotation: new BABYLON.Vector3(0.1, 0.2, 0.3),
    upVector: new BABYLON.Vector3(0, 1, 0),
    fov: 0.8,
    minZ: 0.25,
    setTarget(value) { this.target = value; },
  };
  const runtime = createNativeAseqBabylonCamera(camera);
  const programOwner = {};
  assert.equal(runtime.beginProgram(programOwner, {
    continuousActivities: true,
  }), true);

  const firstOwner = {};
  assert.equal(runtime.begin(firstOwner), true);
  assert.equal(runtime.apply(firstOwner, {
    positionX: 4, positionY: 5, positionZ: 6,
    targetX: 7, targetY: 8, targetZ: 9,
    roll: 0, perspective: 0x4000,
  }), true);
  assert.equal(runtime.end(firstOwner), true);
  assert.deepEqual(camera.position.asArray(), [-4, 5, 6]);

  const secondOwner = {};
  assert.equal(runtime.begin(secondOwner), true);
  assert.deepEqual(camera.position.asArray(), [-4, 5, 6]);
  assert.equal(runtime.end(secondOwner), true);
  assert.equal(runtime.endProgram(programOwner), true);
  assert.deepEqual(camera.position.asArray(), [1, 2, 3]);
  assert.deepEqual(camera.rotation.asArray(), [0.1, 0.2, 0.3]);
  assert.equal(camera.fov, 0.8);
  assert.equal(camera.minZ, 0.25);
});

test("AUTH camera roll cannot leak through Babylon's rendered roll cache", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.UniversalCamera(
    "camera",
    new BABYLON.Vector3(0, 2, -3),
    scene,
  );
  try {
    camera.minZ = 0.25;
    camera.fov = 0.8;
    camera.setTarget(new BABYLON.Vector3(0, 1, 0));
    const baseline = camera.getViewMatrix(true).clone();
    const runtime = createNativeAseqBabylonCamera(camera);
    const owner = {};

    assert.equal(runtime.begin(owner), true);
    assert.equal(runtime.apply(owner, {
      positionX: 4,
      positionY: 5,
      positionZ: 6,
      targetX: 7,
      targetY: 8,
      targetZ: 9,
      roll: 28,
      perspective: 60,
    }), true);
    camera.getViewMatrix(true);
    assert.equal(camera.rotation.z, 0);

    assert.equal(runtime.end(owner), true);
    const restored = camera.getViewMatrix(true);
    assert.deepEqual(camera.upVector.asArray(), [0, 1, 0]);
    assert.equal(camera.rotation.z, 0);
    assert.ok(restored.equals(baseline));
  } finally {
    camera.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH cutscene actors route scene-object transforms without scheduling NPCs", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const door = new BABYLON.TransformNode("door", scene);
    const calls = [];
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => null,
      syncPlayerTransform() {},
      scheduledActors: {
        beginActivityActors: () => {
          calls.push("scheduled-begin");
          return [];
        },
        activityActor() {},
        endActivityActors: () => true,
      },
      motionRuntime: { applyActivitySequence: () => true },
      sceneObjects: {
        actorTags: new Set(["ODR2"]),
        begin: (_owner, actorTags) => actorTags.map(actorCode => ({
          actorCode,
          root: door,
          model: null,
          sceneObject: true,
        })),
        activate: (_owner, actorTag) => (
          calls.push(`objects-activate:${actorTag}`), true
        ),
        end: () => (calls.push("objects-end"), true),
      },
      requirePlayer: false,
    });
    const owner = {};
    assert.equal(runtime.begin(owner, ["ODR2"]), true);
    assert.equal(runtime.applyTransform(owner, "ODR2", {
      x: -2.361,
      y: 1.0551,
      z: -23.4547,
      rotationX: 0,
      rotationY: 84.887604,
      rotationZ: 0,
    }), true);
    assert.deepEqual(
      door.position.asArray(),
      [2.361, 1.0551, -23.4547],
    );
    assert.equal(runtime.end(owner, "complete"), true);
    assert.deepEqual(calls, ["objects-activate:ODR2", "objects-end"]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH cutscene actors route package-owned character variants generically", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("iwao_variant", scene);
    root.setEnabled(false);
    const model = { root, renderRoot: root, loader: {} };
    const packageActors = {
      actorTags: new Set(["IWAO"]),
      begin(owner, tags) {
        assert.deepEqual(tags, ["IWAO"]);
        root.setEnabled(true);
        return [{ actorCode: "IWAO", root, model }];
      },
      end() {
        root.setEnabled(false);
        return true;
      },
    };
    const actors = createNativeAseqBabylonActors({
      getPlayerModel: () => null,
      syncPlayerTransform() {},
      scheduledActors: {
        beginActivityActors() { assert.fail("scheduled actor claimed variant"); },
        activityActor() {},
        endActivityActors() {},
      },
      motionRuntime: { applyActivitySequence: () => true },
      packageActors,
      requirePlayer: false,
    });
    const owner = {};
    actors.begin(owner, ["IWAO"]);
    assert.equal(actors.activeActor("IWAO").model, model);
    assert.equal(root.isEnabled(), true);
    assert.equal(actors.end(owner, "complete"), true);
    assert.equal(root.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH actor acquisition unwinds earlier ownership when a later source fails", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const scheduledRoot = new BABYLON.TransformNode("scheduled", scene);
    const objectRoot = new BABYLON.TransformNode("object", scene);
    const calls = [];
    const failure = new Error("package actor unavailable");
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => null,
      syncPlayerTransform() {},
      scheduledActors: {
        beginActivityActors(owner, actorCodes) {
          calls.push(["scheduled-begin", owner, actorCodes]);
          return [{
            actorCode: "MEGM",
            root: scheduledRoot,
            model: { root: scheduledRoot },
          }];
        },
        activityActor() {},
        endActivityActors(owner) {
          calls.push(["scheduled-end", owner]);
          return true;
        },
      },
      sceneObjects: {
        actorTags: new Set(["NBOX"]),
        begin(owner, actorCodes) {
          calls.push(["objects-begin", owner, actorCodes]);
          return [{
            actorCode: "NBOX",
            root: objectRoot,
            model: null,
            sceneObject: true,
          }];
        },
        activate() { return true; },
        end(owner) {
          calls.push(["objects-end", owner]);
          return true;
        },
      },
      packageActors: {
        actorTags: new Set(["CATM"]),
        begin(owner, actorCodes) {
          calls.push(["package-begin", owner, actorCodes]);
          throw failure;
        },
        end() {
          assert.fail("rejected package ownership was not acquired");
        },
      },
      motionRuntime: { applyActivitySequence: () => true },
      requirePlayer: false,
    });
    const owner = {};

    assert.throws(
      () => runtime.begin(owner, ["MEGM", "NBOX", "CATM"]),
      error => error === failure,
    );
    assert.equal(runtime.active, null);
    assert.deepEqual(calls, [
      ["scheduled-begin", owner, ["MEGM"]],
      ["objects-begin", owner, ["NBOX"]],
      ["package-begin", owner, ["CATM"]],
      ["objects-end", owner],
      ["scheduled-end", owner],
    ]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH program ownership preserves successful shot poses and restores the exact world", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const playerRoot = new BABYLON.TransformNode("player", scene);
    const playerRenderRoot = new BABYLON.TransformNode("player-render", scene);
    playerRenderRoot.parent = playerRoot;
    const megumiRoot = new BABYLON.TransformNode("megumi", scene);
    const boxRoot = new BABYLON.TransformNode("box", scene);
    const catRoot = new BABYLON.TransformNode("cat", scene);
    playerRoot.position.set(1, 2, 3);
    playerRoot.rotation.set(0.1, 0.2, 0.3);
    megumiRoot.position.set(4, 5, 6);
    boxRoot.position.set(7, 8, 9);
    catRoot.position.set(10, 11, 12);
    boxRoot.setEnabled(false);
    catRoot.setEnabled(false);

    const calls = [];
    const rootSnapshot = root => ({
      enabled: root.isEnabled(),
      position: root.position.clone(),
    });
    const restoreRoot = (root, snapshot) => {
      root.position.copyFrom(snapshot.position);
      root.setEnabled(snapshot.enabled);
    };
    let scheduledLease = null;
    const scheduledActors = {
      beginActivityActors(owner, actorTags) {
        calls.push(["scheduled:begin", owner, actorTags]);
        assert.deepEqual(actorTags, ["MEGM"]);
        assert.equal(scheduledLease, null);
        scheduledLease = {
          owner,
          snapshot: rootSnapshot(megumiRoot),
        };
        megumiRoot.setEnabled(true);
        return [{
          actorCode: "MEGM",
          root: megumiRoot,
          model: { root: megumiRoot },
        }];
      },
      activityActor() {},
      endActivityActors(owner) {
        calls.push(["scheduled:end", owner]);
        if (scheduledLease?.owner !== owner) return false;
        restoreRoot(megumiRoot, scheduledLease.snapshot);
        scheduledLease = null;
        return true;
      },
    };
    function nestedRuntime(label, actorCode, root, { sceneObject = false } = {}) {
      let program = null;
      let active = null;
      return {
        actorTags: new Set([actorCode]),
        beginProgram(owner) {
          calls.push([`${label}:program-begin`, owner]);
          program = { owner, snapshot: rootSnapshot(root) };
          return [{ actorCode, root, model: sceneObject ? null : { root }, sceneObject }];
        },
        endProgram(owner) {
          calls.push([`${label}:program-end`, owner]);
          if (program?.owner !== owner || active) return false;
          restoreRoot(root, program.snapshot);
          program = null;
          return true;
        },
        begin(owner, actorTags) {
          calls.push([`${label}:begin`, owner, actorTags]);
          assert.deepEqual(actorTags, [actorCode]);
          active = { owner, snapshot: rootSnapshot(root) };
          return [{ actorCode, root, model: sceneObject ? null : { root }, sceneObject }];
        },
        activate(owner, value) {
          if (!sceneObject || active?.owner !== owner || value !== actorCode) {
            return false;
          }
          root.setEnabled(true);
          return true;
        },
        end(owner, reason) {
          calls.push([`${label}:end`, owner, reason]);
          if (active?.owner !== owner) return false;
          if (reason !== "complete" && reason !== "replaced") {
            restoreRoot(root, active.snapshot);
          }
          active = null;
          return true;
        },
      };
    }
    const sceneObjects = nestedRuntime(
      "objects",
      "NBOX",
      boxRoot,
      { sceneObject: true },
    );
    const packageActors = nestedRuntime("package", "CATM", catRoot);
    const syncs = [];
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => ({
        root: playerRoot,
        renderRoot: playerRenderRoot,
        loader: {},
      }),
      syncPlayerTransform: () => syncs.push(playerRoot.position.asArray()),
      scheduledActors,
      motionRuntime: { applyActivitySequence: () => true },
      sceneObjects,
      packageActors,
    });
    const programOwner = { kind: "program" };
    const firstShotOwner = { kind: "first-shot" };
    const failedShotOwner = { kind: "failed-shot" };

    assert.equal(runtime.beginProgram(
      programOwner,
      ["AKIR", "MEGM", "NBOX", "CATM"],
    ), true);
    assert.equal(runtime.ownsPlayerProgram, true);
    assert.equal(runtime.programActor("AKIR").root, playerRoot);
    assert.equal(runtime.programActor("MEGM").root, megumiRoot);
    assert.equal(runtime.programActor("NBOX").root, boxRoot);
    assert.equal(runtime.programActor("CATM").root, catRoot);

    playerRoot.position.set(20, 21, 22);
    megumiRoot.position.set(23, 24, 25);
    boxRoot.position.set(26, 27, 28);
    catRoot.position.set(29, 30, 31);
    assert.equal(runtime.begin(
      firstShotOwner,
      ["AKIR", "MEGM", "NBOX", "CATM"],
    ), true);
    for (const [actorTag, offset] of [
      ["AKIR", 40],
      ["MEGM", 50],
      ["NBOX", 60],
      ["CATM", 70],
    ]) {
      assert.equal(runtime.applyTransform(firstShotOwner, actorTag, {
        x: offset,
        y: offset + 1,
        z: offset + 2,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      }), true);
    }
    assert.equal(runtime.end(firstShotOwner, "complete"), true);
    assert.deepEqual(playerRoot.position.asArray(), [-40, 41, 42]);
    assert.deepEqual(megumiRoot.position.asArray(), [-50, 51, 52]);
    assert.deepEqual(boxRoot.position.asArray(), [-60, 61, 62]);
    assert.deepEqual(catRoot.position.asArray(), [-70, 71, 72]);
    assert.equal(boxRoot.isEnabled(), true);

    assert.equal(runtime.begin(
      failedShotOwner,
      ["AKIR", "MEGM", "NBOX", "CATM"],
    ), true);
    for (const [actorTag, offset] of [
      ["AKIR", 140],
      ["MEGM", 150],
      ["NBOX", 160],
      ["CATM", 170],
    ]) {
      assert.equal(runtime.applyTransform(failedShotOwner, actorTag, {
        x: offset,
        y: offset + 1,
        z: offset + 2,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      }), true);
    }
    assert.equal(runtime.end(failedShotOwner, "presentation-failed"), true);
    assert.deepEqual(playerRoot.position.asArray(), [-40, 41, 42]);
    assert.deepEqual(megumiRoot.position.asArray(), [-50, 51, 52]);
    assert.deepEqual(boxRoot.position.asArray(), [-60, 61, 62]);
    assert.deepEqual(catRoot.position.asArray(), [-70, 71, 72]);

    assert.equal(runtime.endProgram(programOwner, "complete"), true);
    assert.equal(runtime.programActor("AKIR"), null);
    assert.equal(runtime.ownsPlayerProgram, false);
    assert.deepEqual(playerRoot.position.asArray(), [1, 2, 3]);
    assert.deepEqual(playerRoot.rotation.asArray(), [0.1, 0.2, 0.3]);
    assert.deepEqual(megumiRoot.position.asArray(), [4, 5, 6]);
    assert.deepEqual(boxRoot.position.asArray(), [7, 8, 9]);
    assert.deepEqual(catRoot.position.asArray(), [10, 11, 12]);
    assert.equal(boxRoot.isEnabled(), false);
    assert.equal(catRoot.isEnabled(), false);
    assert.ok(syncs.length >= 3);
    assert.deepEqual(calls.filter(([kind]) => kind.endsWith("program-begin"))
      .map(([kind]) => kind), [
      "objects:program-begin",
      "package:program-begin",
    ]);
    assert.deepEqual(calls.filter(([kind]) => kind.endsWith("program-end"))
      .map(([kind]) => kind), [
      "package:program-end",
      "objects:program-end",
    ]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH shots borrow the exact player already owned by their program", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const ownedRoot = new BABYLON.TransformNode("owned-player", scene);
    const ownedRenderRoot = new BABYLON.TransformNode("owned-player-render", scene);
    ownedRenderRoot.parent = ownedRoot;
    const replacementRoot = new BABYLON.TransformNode("replacement-player", scene);
    const replacementRenderRoot = new BABYLON.TransformNode(
      "replacement-player-render",
      scene,
    );
    replacementRenderRoot.parent = replacementRoot;
    ownedRoot.position.set(1, 2, 3);
    replacementRoot.position.set(10, 20, 30);
    const players = [
      { root: ownedRoot, renderRoot: ownedRenderRoot, loader: {} },
      { root: replacementRoot, renderRoot: replacementRenderRoot, loader: {} },
    ];
    let playerResolutionCount = 0;
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => players[Math.min(playerResolutionCount++, 1)],
      syncPlayerTransform() {},
      scheduledActors: {
        beginActivityActors() { assert.fail("no scheduled actors expected"); },
        activityActor() {},
        endActivityActors() { return true; },
      },
      motionRuntime: { applyActivitySequence: () => true },
    });
    const programOwner = {};
    const shotOwner = {};

    assert.equal(runtime.beginProgram(programOwner, ["AKIR"]), true);
    assert.equal(runtime.begin(shotOwner, ["AKIR"]), true);
    assert.equal(runtime.activeActor("AKIR").root, ownedRoot);
    assert.equal(playerResolutionCount, 1);
    assert.equal(runtime.applyTransform(shotOwner, "AKIR", {
      x: 40,
      y: 41,
      z: 42,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    }), true);
    assert.equal(runtime.end(shotOwner, "complete"), true);
    assert.deepEqual(ownedRoot.position.asArray(), [-40, 41, 42]);
    assert.deepEqual(replacementRoot.position.asArray(), [10, 20, 30]);
    assert.equal(runtime.endProgram(programOwner, "complete"), true);
    assert.deepEqual(ownedRoot.position.asArray(), [1, 2, 3]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH program releases child owners even when they lend no actors", () => {
  const calls = [];
  const runtime = createNativeAseqBabylonActors({
    getPlayerModel: () => null,
    syncPlayerTransform() {},
    scheduledActors: {
      beginActivityActors() { assert.fail("no scheduled actors expected"); },
      activityActor() {},
      endActivityActors() { return true; },
    },
    sceneObjects: {
      actorTags: new Set(),
      begin() { assert.fail("no nested scene objects expected"); },
      activate() { return true; },
      end() { return true; },
      beginProgram(owner) {
        calls.push(["scene:begin", owner]);
        return [];
      },
      endProgram(owner) {
        calls.push(["scene:end", owner]);
        return true;
      },
    },
    packageActors: {
      actorTags: new Set(),
      begin() { assert.fail("no nested package actors expected"); },
      end() { return true; },
      beginProgram(owner) {
        calls.push(["package:begin", owner]);
        return [];
      },
      endProgram(owner) {
        calls.push(["package:end", owner]);
        return true;
      },
    },
    motionRuntime: { applyActivitySequence: () => true },
    ignoredActorTags: ["IGNR"],
    requirePlayer: false,
  });
  const owner = {};

  assert.equal(runtime.beginProgram(owner, ["IGNR"]), true);
  assert.equal(runtime.endProgram(owner, "complete"), true);
  assert.deepEqual(calls, [
    ["scene:begin", owner],
    ["package:begin", owner],
    ["package:end", owner],
    ["scene:end", owner],
  ]);
});

test("AUTH program acquisition unwinds a malformed actor-record batch", () => {
  const calls = [];
  const runtime = createNativeAseqBabylonActors({
    getPlayerModel: () => null,
    syncPlayerTransform() {},
    scheduledActors: {
      beginActivityActors(owner, actorTags) {
        calls.push(["scheduled:begin", owner, actorTags]);
        return {};
      },
      activityActor() {},
      endActivityActors(owner) {
        calls.push(["scheduled:end", owner]);
        return true;
      },
    },
    motionRuntime: { applyActivitySequence: () => true },
    requirePlayer: false,
  });
  const owner = {};

  assert.throws(() => runtime.beginProgram(owner, ["MEGM"]));
  assert.equal(runtime.program, null);
  assert.deepEqual(calls, [
    ["scheduled:begin", owner, ["MEGM"]],
    ["scheduled:end", owner],
  ]);
});

test("failed AUTH shots do not replace the last successful component pose", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const actorRoot = new BABYLON.TransformNode("scheduled", scene);
    const snapshots = new Map();
    const scheduledActors = {
      beginActivityActors(owner, actorTags) {
        assert.deepEqual(actorTags, ["MEGM"]);
        snapshots.set(owner, actorRoot.position.clone());
        return [{
          actorCode: "MEGM",
          root: actorRoot,
          model: { root: actorRoot },
        }];
      },
      activityActor() {},
      endActivityActors(owner) {
        const snapshot = snapshots.get(owner);
        if (!snapshot) return false;
        actorRoot.position.copyFrom(snapshot);
        snapshots.delete(owner);
        return true;
      },
    };
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => null,
      syncPlayerTransform() {},
      scheduledActors,
      motionRuntime: { applyActivitySequence: () => true },
      requirePlayer: false,
    });
    const completedOwner = {};
    const failedOwner = {};

    assert.equal(runtime.begin(completedOwner, ["MEGM"]), true);
    assert.equal(runtime.applyTransform(completedOwner, "MEGM", {
      x: 10,
      y: 11,
      z: 12,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    }), true);
    assert.equal(runtime.end(completedOwner, "complete"), true);
    assert.deepEqual(runtime.componentWorldPosition("MEGM", -1), [-10, 11, 12]);

    actorRoot.position.set(-10, 11, 12);
    assert.equal(runtime.begin(failedOwner, ["MEGM"]), true);
    assert.equal(runtime.applyTransform(failedOwner, "MEGM", {
      x: 20,
      y: 21,
      z: 22,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    }), true);
    assert.equal(runtime.end(failedOwner, "presentation-failed"), true);
    assert.deepEqual(actorRoot.position.asArray(), [-10, 11, 12]);
    assert.deepEqual(runtime.componentWorldPosition("MEGM", -1), [-10, 11, 12]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH program release attempts every actor owner after a cleanup failure", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const playerRoot = new BABYLON.TransformNode("player", scene);
    const playerRenderRoot = new BABYLON.TransformNode("player-render", scene);
    playerRenderRoot.parent = playerRoot;
    const scheduledRoot = new BABYLON.TransformNode("scheduled", scene);
    const objectRoot = new BABYLON.TransformNode("object", scene);
    const packageRoot = new BABYLON.TransformNode("package", scene);
    playerRoot.position.set(1, 2, 3);
    scheduledRoot.position.set(4, 5, 6);
    objectRoot.position.set(7, 8, 9);
    packageRoot.position.set(10, 11, 12);
    const calls = [];
    const programOwner = {};
    const packageError = new Error("package release failed");
    const runtime = createNativeAseqBabylonActors({
      getPlayerModel: () => ({
        root: playerRoot,
        renderRoot: playerRenderRoot,
        loader: {},
      }),
      syncPlayerTransform: () => calls.push("player:sync"),
      scheduledActors: {
        beginActivityActors(owner, actorTags) {
          assert.equal(owner, programOwner);
          assert.deepEqual(actorTags, ["MEGM"]);
          return [{
            actorCode: "MEGM",
            root: scheduledRoot,
            model: { root: scheduledRoot },
          }];
        },
        activityActor() {},
        endActivityActors(owner) {
          calls.push("scheduled:end");
          assert.equal(owner, programOwner);
          scheduledRoot.position.set(4, 5, 6);
          return true;
        },
      },
      sceneObjects: {
        actorTags: new Set(["NBOX"]),
        begin() { assert.fail("no nested activity expected"); },
        activate() { return true; },
        end() { return true; },
        beginProgram(owner) {
          assert.equal(owner, programOwner);
          return [{
            actorCode: "NBOX",
            root: objectRoot,
            model: null,
            sceneObject: true,
          }];
        },
        endProgram(owner) {
          calls.push("objects:end");
          assert.equal(owner, programOwner);
          objectRoot.position.set(7, 8, 9);
          return true;
        },
      },
      packageActors: {
        actorTags: new Set(["CATM"]),
        begin() { assert.fail("no nested activity expected"); },
        end() { return true; },
        beginProgram(owner) {
          assert.equal(owner, programOwner);
          return [{
            actorCode: "CATM",
            root: packageRoot,
            model: { root: packageRoot },
          }];
        },
        endProgram(owner) {
          calls.push("package:end");
          assert.equal(owner, programOwner);
          throw packageError;
        },
      },
      motionRuntime: { applyActivitySequence: () => true },
    });

    assert.equal(runtime.beginProgram(
      programOwner,
      ["AKIR", "MEGM", "NBOX", "CATM"],
    ), true);
    playerRoot.position.set(21, 22, 23);
    scheduledRoot.position.set(24, 25, 26);
    objectRoot.position.set(27, 28, 29);
    packageRoot.position.set(30, 31, 32);

    assert.throws(
      () => runtime.endProgram(programOwner, "world-change"),
      error => (
        error instanceof AggregateError
        && error.errors.length === 1
        && error.errors[0] === packageError
      ),
    );
    assert.deepEqual(calls, [
      "package:end",
      "objects:end",
      "scheduled:end",
      "player:sync",
    ]);
    assert.equal(runtime.program, null);
    assert.deepEqual(playerRoot.position.asArray(), [1, 2, 3]);
    assert.deepEqual(scheduledRoot.position.asArray(), [4, 5, 6]);
    assert.deepEqual(objectRoot.position.asArray(), [7, 8, 9]);
    assert.deepEqual(packageRoot.position.asArray(), [30, 31, 32]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
