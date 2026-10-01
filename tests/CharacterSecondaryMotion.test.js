import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as B from "@babylonjs/core";
import { CharacterRuntime } from "../play/characters/CharacterRuntime.js";
import { ScheduledActorMotionRuntime } from "../play/characters/ScheduledActorMotionRuntime.js";
import { AnimationStateMachine } from "../play/characters/AnimationStateMachine.js";
import { createRemoteAvatar } from "../play/characters/RemoteAvatarFactory.js";
import { nativeClothStateForModel } from "../play/characters/NativeClothBabylonPresentation.js";
import { nativeSecondaryMotionStateForModel, createNativeSecondaryMotionPresentation } from "../play/characters/NativeSecondaryMotionRuntime.js";
import { releaseNativeCharacterSecondaryMotion } from "../play/characters/NativeCharacterSecondaryMotion.js";
import { npcControllerFamilyForModel } from "../play/characters/NpcControllerFamilies.js";
import { CHARACTER_BY_ID } from "../play/config/characters.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { RYO_YK_RENDER_MATRIX_ROUTES } from "../src/RuntimeMatrixRecording.js";

const read = path => {
  const bytes = fs.readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
const referencePath = "public/models/S2_YDB1_YKC_M.MT5";
const motionPath = ".disc-work/runtime-motion/MOTION.BIN";
const mobjPath = "play/assets/scheduled-actors/M_MOBJ.BIN";
const hasAssets = [referencePath, motionPath, mobjPath].every(path => fs.existsSync(path));

async function setup(t) {
  const engine = new B.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new B.Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const runtime = new CharacterRuntime({ scene, renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES), fetchArrayBuffer: async path => read(path) });
  const reference = await runtime.createModel({ label: "Ryo", modelUrl: referencePath, modelCode: "YKC_M" });
  runtime.setReferenceBind(reference.loader, reference.root);
  const create = code => runtime.createModel({ label: code, modelCode: code, modelUrl: `play/assets/characters/${code}.CHRM` });
  return { scene, runtime, create };
}

function assertBodyJoins(model, cloth) {
  model.renderRoot._mt5CharacterGpuRig.skeleton.prepare(true);
  const bodyPoints = new Map();
  for (const mesh of model.renderRoot.getChildMeshes().filter(mesh => !mesh._mt5NativeClothSide && mesh._mt5SourceVertexIndices)) {
    const positions = mesh.getPositionData(true, true);
    mesh._mt5SourceVertexIndices.forEach((source, index) => {
      if (!bodyPoints.has(source)) bodyPoints.set(source, []);
      bodyPoints.get(source).push(Array.from(positions.slice(index * 3, index * 3 + 3)));
    });
  }
  let checked = 0;
  for (const group of cloth.groups) for (const output of group.outputs) for (const { mesh } of output.meshes) {
    const positions = mesh.getVerticesData("position");
    mesh._mt5SourceVertexIndices.forEach((source, index) => {
      if (!output.externalSourceVertexIndices.includes(source) || !bodyPoints.has(source)) return;
      const gap = Math.min(...bodyPoints.get(source).map(point => Math.hypot(...point.map((value, axis) => value - positions[index * 3 + axis]))));
      assert.ok(gap < 1e-6, `${model.modelCode}: body/cloth gap ${gap} m`);
      checked++;
    });
  }
  return checked;
}

test("scheduled cloth and all 13 ordinary NPC OSAG models advance from real walking poses", { skip: !hasAssets }, async t => {
  const { runtime, create } = await setup(t);
  const motion = new ScheduledActorMotionRuntime({ renderMatrixByKey: runtime.renderMatrixByKey, characterRuntime: runtime, fetchArrayBuffer: async path => read(path), bankUrls: { mobj: mobjPath } });
  const profiles = Object.values(JSON.parse(fs.readFileSync("play/data/scheduled-actor-motions.json")).movementProfiles);
  const codes = ["AME_L", "FRO_L", "GKB_L", "HPX_L", "HPY_L", "HSB_L", "JOJ_L", "KAO_L", "KHY_L", "MIB_L", "OBA_L", "SIA_L", "YYI_L", "HPD_L", "HOS_L", "INE_M"];
  let animatedChains = 0, joins = 0;
  for (const code of codes) {
    const family = npcControllerFamilyForModel(code);
    const profile = profiles.find(row => row.controllerFamilyIndex === family.index && row.name.includes("WALK"));
    assert.ok(profile, code);
    const selection = { bank: profile.bank, name: profile.name, loop: true, movement: true };
    await motion.loadNamedSelections([selection]);
    const { root, presentationModel: model } = await create(code);
    for (let frame = 0; frame <= 60; frame++) {
      assert.equal(motion.applyNamed(model, selection, frame / 60), true);
      root.position.x = frame * 0.002;
      runtime.updateSecondaryMotion(root, frame === 0 ? 0 : 1 / 60);
      if (frame > 0) joins += assertBodyJoins(model, nativeClothStateForModel(model));
    }
    const secondary = nativeSecondaryMotionStateForModel(model);
    if (secondary.active) {
      animatedChains++;
      for (const chain of secondary.chains) {
        assert.equal(chain.solver.frame, 30, `${code}: one native step per 1/30 second`);
        assert.ok(chain.solver.points.every(point => point.asArray().every(Number.isFinite)));
      }
    }
    releaseNativeCharacterSecondaryMotion(model);
    root.dispose(false, true);
    motion.clips.clear();
  }
  assert.equal(animatedChains, 13);
  assert.ok(joins > 1000);
});

test("gameplay secondary motion shares AUTH ownership, resets at handoff, and preserves 30 Hz results", { skip: !hasAssets }, async t => {
  const { runtime, create } = await setup(t);
  const { loader, root, presentationModel: model } = await create("SIA_L");
  const motion = new ScheduledActorMotionRuntime({ renderMatrixByKey: runtime.renderMatrixByKey, characterRuntime: runtime, fetchArrayBuffer: async path => read(path), bankUrls: { mobj: mobjPath } });
  const selection = { bank: "mobj", name: "KOD_KOD_WALK_LP", loop: true, movement: true };
  await motion.loadNamedSelections([selection]);
  const state = nativeSecondaryMotionStateForModel(model);
  const run = fps => {
    releaseNativeCharacterSecondaryMotion(model);
    motion.applyNamed(model, selection, 0);
    runtime.updateSecondaryMotion(root, 0);
    for (let frame = 1; frame <= fps; frame++) {
      motion.applyNamed(model, selection, frame / fps);
      runtime.updateSecondaryMotion(root, 1 / fps);
    }
    return state.chains.flatMap(chain => chain.solver.points.flatMap(point => point.asArray()));
  };
  const thirty = run(30), sixty = run(60);
  assert.ok(thirty.every((value, index) => Math.abs(value - sixty[index]) < 1e-6));
  const auth = createNativeSecondaryMotionPresentation({ actors: { activeActor: () => ({ model }) } });
  const owner = {};
  auth.begin(owner, ["SIA"]);
  auth.apply(owner);
  const frames = state.chains.map(chain => chain.solver.frame);
  assert.equal(runtime.updateSecondaryMotion(root, 1 / 30), false);
  assert.deepEqual(state.chains.map(chain => chain.solver.frame), frames);
  auth.end(owner);
  motion.applyNamed(model, selection, 0);
  runtime.updateSecondaryMotion(root, 0);
  assert.ok(state.chains.every(chain => chain.solver.frame === 0));
  runtime.applyCharacterRigWorldMatrices(loader, root, model.latestRetargetedRoutes);
  assert.equal(runtime.updateSecondaryMotion(root, 1 / 30), false);
  assert.equal(state.localMatrices, null);
  assert.equal(nativeClothStateForModel(model).acquired, false);
});

test("remote locomotion, blends and emotes update the canonical cloth model", { skip: !hasAssets }, async t => {
  const { scene, runtime, create } = await setup(t);
  const animation = new AnimationStateMachine({ renderMatrixByKey: runtime.renderMatrixByKey, runtimeEmotes: [], emotes: [], gameTicksPerSecond: 30 });
  const names = { idle: "AKI_AKI_STAND_DOWN_LP", walk: "A_WALK_L_02" };
  const motions = MotnLoader.parse(read(motionPath), { sequenceNames: Object.values(names) });
  animation.clips = Object.fromEntries(Object.entries(names).map(([state, name]) => [state, animation.buildClip(motions, name)]));
  const character = [...CHARACTER_BY_ID.values()].find(character => character.modelCode === "HPX_L");
  assert.ok(character);
  let model;
  const avatar = await createRemoteAvatar({ scene, characterId: character.id, initialPosition: B.Vector3.Zero(), characterRuntime: runtime,
    createCharacterModel: async () => { const loaded = await create("HPX_L"); model = loaded.presentationModel; return loaded; },
    buildRetargetMatrices: (...args) => runtime.buildRetargetMatrices(...args),
    modelForwardYawOffset: (...args) => runtime.modelForwardYawOffset(...args), playableModelYawOffset: () => 0,
    buildForkliftArmRetargetProfile: (...args) => runtime.buildMirroredForkliftArmRetargetProfile(...args),
    retargetMatrices: (...args) => runtime.retargetWithMap(...args),
    clipPoseAt: (...args) => animation.clipPoseAt(...args),
    remoteEmotePose: (_id, seconds) => animation.clipPoseAt("walk", seconds * 30, { loop: true }),
    isKnownEmote: id => id === "probe", characterMinimumWorldY: root => runtime.minimumWorldY(root),
    chassisTiltFromOrientation: () => B.Quaternion.Identity(), quaternionFromNetworkState: () => B.Quaternion.Identity(),
  });
  t.after(() => avatar.dispose());
  for (const state of [{ movement: "idle" }, { movement: "walk" }, { animationId: "probe", animationRevision: 1 }]) {
    avatar.syncState(state);
    for (let frame = 0; frame < 15; frame++) {
      avatar.update(1 / 60);
      assert.equal(model.latestControllerMatrices.length, 37);
      assert.equal(nativeClothStateForModel(model).acquired, true);
      assert.ok(assertBodyJoins(model, nativeClothStateForModel(model)) > 0);
    }
  }
  assert.ok(nativeClothStateForModel(model).runtimeSeconds > 0.7);
  assert.ok(nativeSecondaryMotionStateForModel(model).chains.every(chain => chain.solver.frame > 10));
});
