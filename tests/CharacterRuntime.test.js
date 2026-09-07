import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";
import {
  createHumanoidMotnControls,
  evaluateHumanoidMotnFrame,
} from "../src/RyoMotnRuntime.js";
import {
  evaluateHumanoidRuntimeControls,
  rowEulerRaw,
} from "../src/ShenmueRuntimeRig.js";
import {
  RYO_YK_RENDER_MATRIX_ROUTES,
} from "../src/RuntimeMatrixRecording.js";
import { CharacterRuntime } from "../play/characters/CharacterRuntime.js";
import {
  HRSK_35_CONTROLLER_FAMILY,
  SHENMUE_CONTROLLER_FAMILIES,
  controllerFamilyByIndex,
  npcControllerFamilyForMotion,
  npcControllerFamilyForModel,
} from "../play/characters/NpcControllerFamilies.js";

test("character runtime preserves signed MT5 render keys", () => {
  const runtime = new CharacterRuntime({
    scene: {},
    renderMatrixByKey: new Map(),
    fetchArrayBuffer() {},
  });
  assert.equal(runtime.signedRenderKey({ flag: 0xffff }), -1);
  assert.equal(runtime.signedRenderKey({ flag: 0x7fff }), 32767);
});

test("archive-local actors build their embedded native rig without a player reference", () => {
  const runtime = new CharacterRuntime({
    scene: {},
    renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
    fetchArrayBuffer() {},
  });
  const family = controllerFamilyByIndex(15);
  const profile = runtime.buildHumanoidControlRig({}, {}, {
    modelCode: "MGR_M",
    controllerFamily: family,
  });
  assert.equal(profile.controllerFamily, family.id);
  assert.equal(profile.rig.length, family.nodes.length);
  assert.equal(profile.renderMatrixByKey.size > 0, true);
  assert.equal(profile.proportions.overall, 1);
});

test("character runtime swaps authored sock feet for outdoor footwear", () => {
  const runtime = new CharacterRuntime({
    scene: {},
    renderMatrixByKey: new Map(),
    fetchArrayBuffer() {},
  });
  const mesh = () => ({
    enabled: true,
    setEnabled(enabled) {
      this.enabled = enabled;
    },
  });
  const socks = [18, 19, 23, 24].map((flag) => ({ flag, mesh: mesh() }));
  const unrelated = { flag: 17, mesh: mesh() };
  const footwearRoot = mesh();
  const root = {
    _mt5Nodes: [...socks, unrelated],
    _mt5OutdoorFootwear: {
      root: footwearRoot,
      renderKeys: [18, 19, 23, 24],
    },
  };

  assert.equal(runtime.setOutdoorFootwear(root, true), true);
  assert.ok(socks.every((node) => node.mesh.enabled === false));
  assert.equal(unrelated.mesh.enabled, true);
  assert.equal(footwearRoot.enabled, true);

  runtime.setOutdoorFootwear(root, false);
  assert.ok(socks.every((node) => node.mesh.enabled === true));
  assert.equal(unrelated.mesh.enabled, true);
  assert.equal(footwearRoot.enabled, false);
});

test("character runtime applies each pose to an attached footwear rig", () => {
  const runtime = new CharacterRuntime({
    scene: {},
    renderMatrixByKey: new Map(),
    fetchArrayBuffer() {},
  });
  const calls = [];
  const loader = {
    applyCharacterRigWorldMatrices(root, matrices) {
      calls.push([root, matrices]);
    },
  };
  const footwearLoader = {
    applyCharacterRigWorldMatrices(root, matrices) {
      calls.push([root, matrices]);
    },
  };
  const footwearRoot = {};
  const root = {
    _mt5OutdoorFootwear: {
      loader: footwearLoader,
      root: footwearRoot,
    },
  };
  const matrices = new Map([[18, [1]]]);

  runtime.applyCharacterRigWorldMatrices(loader, root, matrices);

  assert.deepEqual(calls, [
    [root, matrices],
    [footwearRoot, matrices],
  ]);
});

function matrix({
  translation = BABYLON.Vector3.Zero(),
  rotation = BABYLON.Quaternion.Identity(),
} = {}) {
  return [...BABYLON.Matrix.Compose(
    BABYLON.Vector3.One(),
    rotation,
    translation,
  ).asArray()];
}

test("local NPC retargeting preserves the target CHRM bone length", () => {
  const runtime = new CharacterRuntime({
    scene: {},
    renderMatrixByKey: new Map([[1, 0], [2, 1]]),
    fetchArrayBuffer() {},
  });
  const sourceParentBind = matrix({
    translation: new BABYLON.Vector3(0, 1, 0),
  });
  const sourceChildBindLocal = matrix({
    translation: new BABYLON.Vector3(1, 0, 0),
  });
  runtime.referenceBindByRenderKey = new Map([
    [1, sourceParentBind],
    [2, Mt5Loader.rowMultiply(sourceChildBindLocal, sourceParentBind)],
  ]);
  runtime.referenceParentByRenderKey = new Map([[1, null], [2, 1]]);

  const targetParentBind = matrix({
    translation: new BABYLON.Vector3(0, 2, 0),
  });
  const targetChildBindLocal = matrix({
    translation: new BABYLON.Vector3(5, 0, 0),
  });
  const profile = {
    targetBindByRenderKey: new Map([
      [1, targetParentBind],
      [2, Mt5Loader.rowMultiply(targetChildBindLocal, targetParentBind)],
    ]),
    targetParentByRenderKey: new Map([[1, null], [2, 1]]),
  };

  const animatedParent = matrix({
    translation: new BABYLON.Vector3(20, 30, 40),
    rotation: BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, Math.PI / 4),
  });
  const animatedChildLocal = matrix({
    translation: new BABYLON.Vector3(50, 0, 0),
    rotation: BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI / 3),
  });
  const retargeted = runtime.retargetLocally(new Map([
    [1, animatedParent],
    [2, Mt5Loader.rowMultiply(animatedChildLocal, animatedParent)],
  ]), profile);
  const targetChildLocal = runtime.localMatrix(
    retargeted.get(2),
    retargeted.get(1),
  );
  const decomposed = runtime.rotationFromMatrix(targetChildLocal);

  assert.ok(Math.abs(decomposed.translation.x - 5) < 1e-6);
  assert.ok(Math.abs(decomposed.translation.y) < 1e-6);
  assert.ok(Math.abs(decomposed.translation.z) < 1e-6);
  assert.ok(Math.abs(decomposed.rotation.y) > 0.1);

  const rootTranslated = runtime.retargetLocally(new Map([
    [1, animatedParent],
    [2, Mt5Loader.rowMultiply(animatedChildLocal, animatedParent)],
  ]), profile, { preserveRootTranslation: true });
  const translatedRoot = runtime.rotationFromMatrix(
    rootTranslated.get(1),
  ).translation;
  assert.ok(Math.abs(translatedRoot.x - 20) < 1e-6);
  assert.ok(Math.abs(translatedRoot.y - 31) < 1e-6);
  assert.ok(Math.abs(translatedRoot.z - 40) < 1e-6);
  const translatedChildLocal = runtime.localMatrix(
    rootTranslated.get(2),
    rootTranslated.get(1),
  );
  assert.ok(
    Math.abs(
      runtime.rotationFromMatrix(translatedChildLocal).translation.x - 5,
    ) < 2e-6,
  );
});

test("forklift retargeting swaps only generated NPC arm animation channels", () => {
  const runtime = new CharacterRuntime({
    scene: {},
    renderMatrixByKey: new Map(),
    fetchArrayBuffer() {},
  });
  const reference = new Map([
    [1, [1]], [5, [5]], [6, [6]], [10, [10]], [11, [11]],
  ]);
  runtime.referenceBindByRenderKey = reference;
  runtime.referenceParentByRenderKey = new Map([
    [1, null], [5, 1], [6, 5], [10, 1], [11, 10],
  ]);
  const targetProfile = {
    targetBindByRenderKey: new Map(reference),
    targetParentByRenderKey: new Map(runtime.referenceParentByRenderKey),
  };
  runtime.buildLocalRetargetProfile = () => targetProfile;

  const profile = runtime.buildMirroredForkliftArmRetargetProfile({}, {});
  assert.equal(profile.sourceBindByRenderKey.get(5), reference.get(10));
  assert.equal(profile.sourceBindByRenderKey.get(6), reference.get(11));
  assert.equal(profile.sourceParentByRenderKey.get(6), 5);
  assert.equal(profile.sourceParentByRenderKey.get(11), 10);

  const routes = new Map([
    [1, [101]], [5, [105]], [6, [106]], [10, [110]], [11, [111]],
  ]);
  runtime.retargetWithMap = () => new Map([
    [1, [201]], [5, [205]], [6, [206]], [10, [210]], [11, [211]],
  ]);
  runtime.retargetLocally = (mirroredRoutes, receivedProfile) => {
    assert.equal(receivedProfile, profile);
    assert.equal(mirroredRoutes.get(5), routes.get(10));
    assert.equal(mirroredRoutes.get(6), routes.get(11));
    assert.equal(mirroredRoutes.get(10), routes.get(5));
    assert.equal(mirroredRoutes.get(11), routes.get(6));
    return new Map([
      [5, [305]], [6, [306]], [10, [310]], [11, [311]],
    ]);
  };

  const result = runtime.retargetMirroredForkliftArms(
    routes,
    new Map(),
    profile,
  );
  assert.deepEqual(result.get(1), [201]);
  assert.deepEqual(result.get(5), [305]);
  assert.deepEqual(result.get(11), [311]);
});

function fileArrayBuffer(filename) {
  const bytes = fs.readFileSync(filename);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

async function loadCharacter(filename) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const loader = new Mt5Loader(scene, {
    characterRigMode: "baked",
  });
  const [root] = await loader.load(fileArrayBuffer(filename), null);
  return { engine, scene, loader, root };
}

test("playable forward yaw follows the authored humanoid root basis", async () => {
  const reference = await loadCharacter(
    "public/models/S2_YDB1_YKC_M.MT5",
  );
  const hato = await loadCharacter(
    "play/assets/characters/BAT_L.CHRM",
  );
  const conventional = await loadCharacter(
    "play/assets/characters/HOS_L.CHRM",
  );
  try {
    const runtime = new CharacterRuntime({
      scene: hato.scene,
      renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
      fetchArrayBuffer() {},
    });
    runtime.setReferenceBind(reference.loader, reference.root);
    const hatoYaw = runtime.modelForwardYawOffset(
      runtime.buildRetargetMatrices(hato.loader, hato.root),
    );
    const conventionalYaw = runtime.modelForwardYawOffset(
      runtime.buildRetargetMatrices(conventional.loader, conventional.root),
    );

    assert.ok(Math.abs(Math.abs(hatoYaw) - Math.PI) < 1e-6);
    assert.ok(Math.abs(conventionalYaw) < 1e-6);
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    hato.scene.dispose();
    hato.engine.dispose();
    conventional.scene.dispose();
    conventional.engine.dispose();
  }
});

test("scheduled child controls use the GKA CHRM limb lengths", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const child = await loadCharacter(
    "play/assets/characters/GKA_L.CHRM",
  );
  try {
    const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const runtime = new CharacterRuntime({
      scene: child.scene,
      renderMatrixByKey,
      fetchArrayBuffer() {},
    });
    runtime.setReferenceBind(reference.loader, reference.root);
    const profile = runtime.buildHumanoidControlRig(
      child.loader,
      child.root,
      { modelCode: "GKA_L" },
    );

    assert.ok(profile);
    assert.equal(profile.controllerFamily, "SH4_04");
    assert.ok(Math.abs(profile.rig[7].defaultPosition[0] - 0.312) < 1e-5);
    assert.ok(Math.abs(profile.rig[8].defaultPosition[0] - 0.352) < 1e-5);
    assert.ok(Math.abs(profile.rig[28].defaultPosition[0] - 0.2) < 1e-5);
    assert.ok(Math.abs(profile.rig[29].defaultPosition[0] - 0.2) < 1e-5);
    assert.ok(Math.abs(profile.rig[20].defaultPosition[0] - 0.304) < 1e-6);
    assert.deepEqual(
      profile.rig.slice(25, 37).map((control) => control.type),
      [13, 14, 15, 16, 17, 18, 7, 8, 9, 10, 11, 12],
    );
    assert.equal(profile.renderMatrixByKey.get(5), 27);
    assert.equal(profile.renderMatrixByKey.get(10), 33);
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    child.scene.dispose();
    child.engine.dispose();
  }
});

test("controller families combine executable descriptors with CHRM selectors", () => {
  assert.equal(SHENMUE_CONTROLLER_FAMILIES.length, 21);
  assert.deepEqual(
    SHENMUE_CONTROLLER_FAMILIES.map((family) => family.nodes.length),
    [
      37, 37, 37, 37, 37, 37, 37, 37, 37, 35, 37,
      35, 37, 37, 35, 35, 41, 42, 43, 35, 43,
    ],
  );
  assert.equal(controllerFamilyByIndex(4)?.id, "SH4_04");
  assert.equal(controllerFamilyByIndex(15)?.id, "SH4_15");
  assert.equal(npcControllerFamilyForModel("GKA_L")?.id, "SH4_04");
  assert.equal(npcControllerFamilyForModel("NZM_L")?.id, "SH4_15");
  assert.equal(npcControllerFamilyForModel("QHT_L")?.id, "SH4_04");
  assert.equal(npcControllerFamilyForModel("HPD_L")?.id, "SH4_15");
  assert.equal(npcControllerFamilyForModel("WAP_L")?.id, "SH4_07");
  assert.equal(npcControllerFamilyForModel("KOM_L")?.id, "SH4_04");
});

test("controller type selects aimed heads across human and animal families", () => {
  for (const family of SHENMUE_CONTROLLER_FAMILIES) {
    const oneBoneRoots = family.nodes.filter(
      (node) => node.solverClass === 2 && node.solverSubtype === 1,
    );
    assert.equal(oneBoneRoots.some((node) => node.type === 0x01), true);
    assert.equal(oneBoneRoots.some((node) => node.type === 0x04), true);
    for (const node of oneBoneRoots) {
      assert.equal(
        [0x01, 0x04, 0x13, 0x24].includes(node.type),
        true,
        `unexpected class-2/subtype-1 controller type ${node.type}`,
      );
    }
  }

  // These are the exact target families used by the two reported actors:
  // Kenta Shimizu (SVB_L/family 10) and Yayoi Arisugawa
  // (YYI_L/family 19). Both human head roots carry a one in descriptor byte
  // +4, unlike the animal head roots, but controller type 4 still requires
  // the aimed solver in every family.
  for (const modelCode of ["SVB_L", "YYI_L"]) {
    const family = npcControllerFamilyForModel(modelCode);
    const headRoot = family.nodes.findIndex((node) => node.type === 0x04);
    const head = family.nodes[headRoot].children[0];
    const target = family.nodes[head].children.find(
      (index) => family.nodes[index].solverClass === 4,
    );
    assert.equal(family.nodes[headRoot].descriptorHeader[4], 1);

    const controls = family.nodes.map((node) => ({
      position: [...node.defaultPosition],
      rotationRaw: [...node.defaultRotationRaw],
    }));
    controls[target].position = [2, 3, 4];
    const matrices = evaluateHumanoidRuntimeControls(controls, {
      runtimeRig: family.nodes,
    });
    const direction = controls[target].position.map(
      (value, index) => value - matrices[headRoot][12 + index],
    );
    const length = Math.hypot(...direction);
    for (let index = 0; index < 3; index++) {
      assert.ok(
        Math.abs(matrices[head][index] - direction[index] / length) < 1e-6,
        `${modelCode} head must use its authored aim target`,
      );
    }
  }
});

test("Nozomi uses the exact captured 35-control neutral skeleton", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const nozomi = await loadCharacter(
    "play/assets/characters/NZM_L.CHRM",
  );
  try {
    const runtime = new CharacterRuntime({
      scene: nozomi.scene,
      renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
      fetchArrayBuffer() {},
    });
    runtime.setReferenceBind(reference.loader, reference.root);
    const profile = runtime.buildHumanoidControlRig(
      nozomi.loader,
      nozomi.root,
      {
        modelCode: "NZM_L",
        controllerFamily: HRSK_35_CONTROLLER_FAMILY,
      },
    );

    assert.equal(profile.rig.some((control) => control.type === 35), false);
    assert.equal(profile.rig.some((control) => control.type === 28), false);
    assert.ok(
      Math.abs(profile.rig[0].defaultPosition[1] - 1.0527238845825195)
        < 1e-6,
    );
    assert.deepEqual(profile.rig[18].children, [19, 23, 29]);
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    nozomi.scene.dispose();
    nozomi.engine.dispose();
  }
});

test("motions select their exact authored controller family", () => {
  const motionBytes = fileArrayBuffer(
    "play/assets/scheduled-actors/M_MBAS.BIN",
  );
  const movement = MotnLoader.parse(motionBytes, {
    sequenceNames: ["SIN_SIN_WALK_LP", "JIJ_YNG_WALK_LP_F"],
  });
  const sin = movement.sequences.find(
    (sequence) => sequence.name === "SIN_SIN_WALK_LP",
  );
  const jij = movement.sequences.find(
    (sequence) => sequence.name === "JIJ_YNG_WALK_LP_F",
  );

  assert.equal(npcControllerFamilyForMotion("NZM_L", sin).id, "SH4_15");
  assert.equal(npcControllerFamilyForMotion("NZM_L", jij).id, "SH4_07");
  assert.equal(npcControllerFamilyForMotion("unrelated", sin).id, "SH4_15");
  assert.equal(npcControllerFamilyForMotion("unrelated", jij).id, "SH4_07");
});

test("motion metadata is independent of the target character model", () => {
  const mbas = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_MBAS.BIN"),
    { sequenceNames: ["GAK_WALK_LP_F"] },
  );
  const free = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_FREE.BIN"),
    { sequenceNames: ["PNW_WOM_TALK_OKORU_F"] },
  );
  const walk = mbas.sequences.find(
    (sequence) => sequence.name === "GAK_WALK_LP_F",
  );
  const talk = free.sequences.find(
    (sequence) => sequence.name === "PNW_WOM_TALK_OKORU_F",
  );

  assert.equal(
    npcControllerFamilyForMotion("QHT_L", walk).id,
    "SH4_04",
  );
  assert.equal(
    npcControllerFamilyForMotion("QHT_L", talk).id,
    "SH4_19",
  );
});

test("different motions retain their independently authored source families", () => {
  const mbas = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_MBAS.BIN"),
    { sequenceNames: ["PNW_WALK_LP_F"] },
  );
  const free = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_FREE.BIN"),
    { sequenceNames: ["OTH_SIT_DESK_EN_F"] },
  );
  const walk = mbas.sequences.find(
    (sequence) => sequence.name === "PNW_WALK_LP_F",
  );
  const sit = free.sequences.find(
    (sequence) => sequence.name === "OTH_SIT_DESK_EN_F",
  );

  for (const modelCode of ["SIB_L", "GRL_L", "OBA_L", "YED_L"]) {
    assert.equal(
      npcControllerFamilyForMotion(modelCode, walk).id,
      "SH4_19",
    );
    assert.equal(
      npcControllerFamilyForMotion(modelCode, sit).id,
      "SH4_10",
    );
  }
});

test("motion curves remap from source indices to target controls by type", () => {
  const sourceFamily = controllerFamilyByIndex(4);
  const targetFamily = controllerFamilyByIndex(15);
  const sourceIndex = 25;
  const sourceType = sourceFamily.nodes[sourceIndex].type;
  const targetIndex = targetFamily.nodes.findIndex(
    (node) => node.type === sourceType,
  );

  assert.equal(sourceType, 13);
  assert.equal(targetIndex, 29);
  assert.notEqual(sourceIndex, targetIndex);

  const controls = createHumanoidMotnControls(
    {
      name: "TYPE_REMAP_TEST",
      valueData: {
        curves: [{
          boneId: sourceIndex,
          channel: "rx",
          samples: [{ frame: 0, value: 0.25 }],
        }],
      },
    },
    0,
    targetFamily.nodes,
    { sourceControllerFamily: sourceFamily },
  );

  assert.equal(controls[targetIndex].rotationRaw[0], 16384);
  assert.equal(
    controls[sourceIndex].rotationRaw[0],
    targetFamily.nodes[sourceIndex].defaultRotationRaw[0],
  );
});

test("partial MOTN actions preserve unauthored controls from their base pose", () => {
  const family = controllerFamilyByIndex(19);
  const base = createHumanoidMotnControls(
    {
      name: "BASE_POSE",
      valueData: {
        curves: [
          {
            boneId: 8,
            channel: "rx",
            samples: [{ frame: 0, value: 0.125 }],
          },
          {
            boneId: 18,
            channel: "ry",
            samples: [{ frame: 0, value: 0.25 }],
          },
        ],
      },
    },
    0,
    family.nodes,
    { sourceControllerFamily: family },
  );
  const layered = createHumanoidMotnControls(
    {
      name: "UPPER_BODY_ACTION",
      valueData: {
        curves: [{
          boneId: 18,
          channel: "ry",
          samples: [{ frame: 0, value: -0.25 }],
        }],
      },
    },
    0,
    family.nodes,
    {
      baseControls: base,
      sourceControllerFamily: family,
    },
  );

  assert.deepEqual(layered[8], base[8]);
  assert.equal(layered[18].rotationRaw[1], -16384);
  assert.notEqual(
    layered[18].rotationRaw[1],
    base[18].rotationRaw[1],
  );
});

test("scheduled adult controls retain PAN's authored proportions", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const adult = await loadCharacter(
    "play/assets/characters/PAN_L.CHRM",
  );
  try {
    const runtime = new CharacterRuntime({
      scene: adult.scene,
      renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
      fetchArrayBuffer() {},
    });
    runtime.setReferenceBind(reference.loader, reference.root);
    const profile = runtime.buildHumanoidControlRig(
      adult.loader,
      adult.root,
    );

    assert.ok(Math.abs(profile.rig[7].defaultPosition[0] - 0.4315) < 1e-4);
    assert.ok(Math.abs(profile.rig[28].defaultPosition[0] - 0.2605) < 1e-4);
    assert.ok(Math.abs(profile.rig[20].defaultPosition[0] - 0.4205) < 1e-4);
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    adult.scene.dispose();
    adult.engine.dispose();
  }
});

test("GAK walking solves against the child skeleton without folded knees", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const child = await loadCharacter(
    "play/assets/characters/GKA_L.CHRM",
  );
  try {
    const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const runtime = new CharacterRuntime({
      scene: child.scene,
      renderMatrixByKey,
      fetchArrayBuffer() {},
    });
    runtime.setReferenceBind(reference.loader, reference.root);
    const controlProfile = runtime.buildHumanoidControlRig(
      child.loader,
      child.root,
      { modelCode: "GKA_L" },
    );
    const retargetProfile = runtime.buildHumanoidRetargetProfile(
      child.loader,
      child.root,
      controlProfile.rig,
    );
    const parsed = MotnLoader.parse(
      fileArrayBuffer("play/assets/scheduled-actors/M_MBAS.BIN"),
      {
        sequenceNames: ["GAK_WALK_LP_F"],
      },
    );
    const sequence = parsed.sequences.find(
      (candidate) => candidate.name === "GAK_WALK_LP_F",
    );
    const evaluated = evaluateHumanoidMotnFrame(
      sequence,
      0,
      controlProfile.rig,
    );
    const routes = new Map(
      [...controlProfile.renderMatrixByKey].map(
        ([renderKey, controlIndex]) => [
          renderKey,
          evaluated.matrices[controlIndex],
        ],
      ),
    );
    const pose = runtime.retargetLocally(routes, retargetProfile);

    for (const kneeKey of [17, 22]) {
      const parentKey = retargetProfile.targetParentByRenderKey.get(kneeKey);
      const animatedLocal = runtime.localMatrix(
        pose.get(kneeKey),
        pose.get(parentKey),
      );
      const bindLocal = runtime.localMatrix(
        retargetProfile.targetBindByRenderKey.get(kneeKey),
        retargetProfile.targetBindByRenderKey.get(parentKey),
      );
      const animated = runtime.rotationFromMatrix(animatedLocal).rotation;
      const bind = runtime.rotationFromMatrix(bindLocal).rotation;
      const delta = animated.multiply(bind.conjugate());
      const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w)));
      assert.ok(angle < Math.PI / 6, `knee ${kneeKey} folded ${angle}`);
    }
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    child.scene.dispose();
    child.engine.dispose();
  }
});

test("alternate NPC hierarchies route only their authored render keys", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const parsed = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_MBAS.BIN"),
    { sequenceNames: ["JIJ_YNG_WALK_LP_F"] },
  );
  const sequence = parsed.sequences.find(
    (candidate) => candidate.name === "JIJ_YNG_WALK_LP_F",
  );
  const sourceFamily = npcControllerFamilyForMotion(null, sequence);

  try {
    for (const modelCode of ["HOB_L", "TKI_L"]) {
      const character = await loadCharacter(
        `play/assets/characters/${modelCode}.CHRM`,
      );
      try {
        const runtime = new CharacterRuntime({
          scene: character.scene,
          renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
          fetchArrayBuffer() {},
        });
        runtime.setReferenceBind(reference.loader, reference.root);

        const authoredRoutes = runtime.renderMatrixRoutesForRoot(
          character.root,
        );
        assert.equal(authoredRoutes.size, 11);
        assert.equal(authoredRoutes.has(0x10), false);
        assert.equal(authoredRoutes.has(0x15), false);
        assert.equal(authoredRoutes.has(0x11), true);
        assert.equal(authoredRoutes.has(0x16), true);
        const playableRetarget = runtime.buildRetargetMatrices(
          character.loader,
          character.root,
        );
        assert.equal(playableRetarget.size, 11);
        assert.equal(playableRetarget.has(0x10), false);
        assert.equal(playableRetarget.has(0x15), false);

        const controlProfile = runtime.buildHumanoidControlRig(
          character.loader,
          character.root,
          { modelCode },
        );
        const renderMatrixByKey = new Map(
          [...controlProfile.renderMatrixByKey].filter(([renderKey]) => (
            authoredRoutes.has(renderKey)
          )),
        );
        const retargetProfile = runtime.buildHumanoidRetargetProfile(
          character.loader,
          character.root,
          controlProfile.rig,
          renderMatrixByKey,
        );
        const evaluated = evaluateHumanoidMotnFrame(
          sequence,
          0,
          controlProfile.rig,
          { sourceControllerFamily: sourceFamily },
        );
        const routes = new Map(
          [...renderMatrixByKey].map(([renderKey, controlIndex]) => [
            renderKey,
            evaluated.matrices[controlIndex],
          ]),
        );
        const pose = runtime.retargetLocally(routes, retargetProfile);

        assert.equal(pose.size, 11);
        for (const matrixValue of pose.values()) {
          assert.equal(matrixValue.length, 16);
          assert.equal(matrixValue.every(Number.isFinite), true);
        }
      } finally {
        character.scene.dispose();
        character.engine.dispose();
      }
    }
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
  }
});

test("cats and dogs route their complete authored nonhuman controller trees", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const parsed = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_MOBJ.BIN"),
    { sequenceNames: ["CAT_CAT_WALK_LP", "DOG_DOG_WALK_LP"] },
  );

  try {
    for (const {
      modelCode,
      expectedRouteCount,
      expectedTailIndex,
      expectedEarRoutes,
      sequenceName,
    } of [
      {
        modelCode: "CT4_M",
        expectedRouteCount: 23,
        expectedTailIndex: 18,
        expectedEarRoutes: false,
        sequenceName: "CAT_CAT_WALK_LP",
      },
      {
        modelCode: "DG2_M",
        expectedRouteCount: 25,
        expectedTailIndex: 18,
        expectedEarRoutes: true,
        sequenceName: "DOG_DOG_WALK_LP",
      },
    ]) {
      const character = await loadCharacter(
        `play/assets/characters/${modelCode}.CHRM`,
      );
      try {
        const runtime = new CharacterRuntime({
          scene: character.scene,
          renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
          fetchArrayBuffer() {},
        });
        runtime.setReferenceBind(reference.loader, reference.root);
        const controlProfile = runtime.buildHumanoidControlRig(
          character.loader,
          character.root,
          { modelCode },
        );
        const authoredRoutes = runtime.renderMatrixRoutesForRoot(
          character.root,
          controlProfile.renderMatrixByKey,
        );

        assert.equal(authoredRoutes.size, expectedRouteCount);
        assert.equal(authoredRoutes.get(0x37), 16);
        assert.equal(authoredRoutes.get(0x38), 17);
        assert.equal(authoredRoutes.get(0x39), expectedTailIndex);
        assert.equal(authoredRoutes.has(0x3a), expectedEarRoutes);
        assert.equal(authoredRoutes.has(0x3b), expectedEarRoutes);

        const sequence = parsed.sequences.find(
          (candidate) => candidate.name === sequenceName,
        );
        const evaluated = evaluateHumanoidMotnFrame(
          sequence,
          0,
          controlProfile.rig,
          {
            sourceControllerFamily: npcControllerFamilyForMotion(
              modelCode,
              sequence,
            ),
          },
        );
        for (const controlIndex of authoredRoutes.values()) {
          const matrixValue = evaluated.matrices[controlIndex];
          assert.equal(matrixValue.length, 16);
          assert.equal(matrixValue.every(Number.isFinite), true);
        }
        if (modelCode === "DG2_M") {
          const controls = createHumanoidMotnControls(
            sequence,
            0,
            controlProfile.rig,
            {
              sourceControllerFamily: npcControllerFamilyForMotion(
                modelCode,
                sequence,
              ),
            },
          );
          const matrices = evaluateHumanoidRuntimeControls(controls, {
            runtimeRig: controlProfile.rig,
          });
          const neckParent = 22;
          const neck = 23;
          const neckLocal = runtime.localMatrix(
            matrices[neck],
            matrices[neckParent],
          );
          const authoredNeckLocal = rowEulerRaw(
            controls[neck].rotationRaw,
          );
          assert.equal(controlProfile.rig[neckParent].descriptorHeader[4], 1);
          for (let index = 0; index < 16; index++) {
            assert.ok(
              Math.abs(neckLocal[index] - authoredNeckLocal[index]) < 1e-6,
              "the ordinary dog neck branch must not enter the aim solver",
            );
          }

          const headRoot = 25;
          const head = 26;
          const headTarget = 27;
          assert.equal(controlProfile.rig[headRoot].descriptorHeader[4], 0);
          const direction = controls[headTarget].position.map(
            (value, index) => value - matrices[headRoot][12 + index],
          );
          const directionLength = Math.hypot(...direction);
          const normalizedDirection = direction.map(
            (value) => value / directionLength,
          );
          for (let index = 0; index < 3; index++) {
            assert.ok(
              Math.abs(matrices[head][index] - normalizedDirection[index])
                < 1e-6,
              "the authored dog head branch must enter the aim solver",
            );
          }
        }
      } finally {
        character.scene.dispose();
        character.engine.dispose();
      }
    }
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
  }
});

test("dog motions preserve the executable-authored animal body orientation", () => {
  const parsed = MotnLoader.parse(
    fileArrayBuffer("play/assets/scheduled-actors/M_MOBJ.BIN"),
    { sequenceNames: ["DOG_DOG_FUSE_NERU_LP"] },
  );
  const sequence = parsed.sequences.find(
    (candidate) => candidate.name === "DOG_DOG_FUSE_NERU_LP",
  );
  const family = npcControllerFamilyForMotion("DG3_M", sequence);
  const controls = createHumanoidMotnControls(
    sequence,
    0,
    family.nodes,
    { sourceControllerFamily: family },
  );

  assert.equal(family.index, 18);
  assert.deepEqual(
    controls[2].rotationRaw,
    family.nodes[2].defaultRotationRaw,
  );
  assert.deepEqual(controls[2].rotationRaw, [0, 0, -32655]);
});
