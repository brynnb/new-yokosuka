import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  createNativeClothPresentation,
  nativeClothStateForModel,
  NativeClothModelState,
} from "../play/characters/NativeClothBabylonPresentation.js";
import { createNativeAseqBabylonActors } from "../play/events/NativeAseqBabylonPresentation.js";
import { CharacterRuntime } from "../play/characters/CharacterRuntime.js";
import { parseNativeClothTrack } from "../play/characters/NativeClothTrack.js";
import {
  prepareNativeClothModelSurfaces,
} from "../play/characters/NativeClothModel.js";
import {
  nativeClothBodyCollisionProfile,
} from "../play/characters/NativeClothProfiles.js";

const modelInventory = JSON.parse(fs.readFileSync(
  "tools/evidence/shenmue1-native-cloth-models.json",
  "utf8",
));

async function loadGpuCharacter(scene, filename) {
  const loader = new Mt5Loader(scene, {
    characterRigMode: "gpu",
    mirrorCharacterX: true,
    backFaceCulling: false,
  });
  const bytes = fs.readFileSync(`play/assets/characters/${filename}`);
  const [renderRoot] = await loader.load(bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ), null, { sourceFilename: filename });
  const surfaces = prepareNativeClothModelSurfaces(renderRoot);
  loader.mergeCharacterGpuRigMeshes(renderRoot, {
    preserveRenderKeySubtrees: surfaces.preservedRenderKeys,
  });
  const root = new BABYLON.TransformNode(`test_${filename}`, scene);
  renderRoot.parent = root;
  return {
    model: {
      modelCode: filename.replace(/\.CHRM$/u, ""),
      loader,
      renderRoot,
      root,
      characterAssetFormat: "MT5",
    },
    surfaces,
  };
}

async function loadOp02Shenhua(scene) {
  const loader = new Mt5Loader(scene, {
    characterRigMode: "gpu",
    mirrorCharacterX: true,
    backFaceCulling: false,
  });
  const bytes = fs.readFileSync(
    "play/assets/introduction/op02/models/MGR_M.CHRM",
  );
  const [renderRoot] = await loader.load(bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ), null, { sourceFilename: "MGR_M.CHRM" });
  const surfaces = prepareNativeClothModelSurfaces(renderRoot);
  loader.mergeCharacterGpuRigMeshes(renderRoot, {
    preserveRenderKeySubtrees: surfaces.preservedRenderKeys,
  });
  const root = new BABYLON.TransformNode("test_MGR_M", scene);
  renderRoot.parent = root;
  return {
    modelCode: "MGR_M",
    loader,
    renderRoot,
    root,
    characterAssetFormat: "MT5",
    nativeClothRuntimeMode: 4,
  };
}

async function loadPlayableRyo(scene, characterRigMode = "baked") {
  const loader = new Mt5Loader(scene, {
    characterRigMode,
    characterRigSeamMode: "weld",
    mirrorCharacterX: true,
    backFaceCulling: false,
  });
  const filename = "S2_YDB1_YKC_M.MT5";
  const bytes = fs.readFileSync(`public/models/${filename}`);
  const [renderRoot] = await loader.load(bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ), null, { sourceFilename: filename });
  const surfaces = prepareNativeClothModelSurfaces(renderRoot);
  if (characterRigMode === "gpu") {
    loader.mergeCharacterGpuRigMeshes(renderRoot, {
      preserveRenderKeySubtrees: surfaces.preservedRenderKeys,
    });
  }
  return {
    model: {
      modelCode: "YKC_M",
      loader,
      renderRoot,
      root: renderRoot,
      characterAssetFormat: "MT5",
    },
    surfaces,
  };
}

function matrixAt(x, y, z) {
  return BABYLON.Matrix.Translation(x, y, z).asArray();
}

function installLanDiControllerPose(model) {
  const authoredPositions = new Map([
    [0, [0, 0, 0]],
    [25, [-0.2, 1.2, 0]],
    [27, [-0.2, 0.8, 0]],
    [32, [0.2, 1.2, 0]],
    [34, [0.2, 0.8, 0]],
  ]);
  const types = [...new Set([
    ...authoredPositions.keys(),
    ...nativeClothBodyCollisionProfile(model.modelCode).records.map(
      record => record.controllerType,
    ),
  ])];
  model.latestControllerFamily = {
    nodes: types.map((type, index) => ({ type, index })),
  };
  model.latestControllerMatrices = types.map(type => (
    matrixAt(...(authoredPositions.get(type) || [0, 0, 0]))
  ));
}

function installCompleteControllerPose(model) {
  const types = Array.from({ length: 48 }, (_, type) => type);
  model.latestControllerFamily = {
    nodes: types.map((type, index) => ({ type, index })),
  };
  model.latestControllerMatrices = types.map(type => matrixAt(
    0.01 + type * 0.013,
    0.02 + (type % 11) * 0.017,
    0.03 + (type % 7) * 0.019,
  ));
}

function normalForSourceVertex(mesh, sourceVertexIndex) {
  const meshVertexIndex = Array.from(
    mesh._mt5SourceVertexIndices || [],
  ).indexOf(sourceVertexIndex);
  assert.notEqual(
    meshVertexIndex,
    -1,
    `${mesh.name} does not contain source vertex ${sourceVertexIndex}`,
  );
  const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
  return Array.from(normals.slice(
    meshVertexIndex * 3,
    meshVertexIndex * 3 + 3,
  ));
}

function assertNormalApproximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, 3);
  assert.equal(expected.length, 3);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) <= epsilon,
      `normal axis ${axis}: ${actual[axis]} != ${expected[axis]}`,
    );
  }
}

function assertNestedValuesApproximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let group = 0; group < actual.length; group += 1) {
    assert.equal(actual[group].length, expected[group].length);
    for (let value = 0; value < actual[group].length; value += 1) {
      assert.ok(
        Math.abs(actual[group][value] - expected[group][value]) <= epsilon,
        `value ${group}:${value}: ${actual[group][value]} != ${expected[group][value]}`,
      );
    }
  }
}

test("native cloth owns only paired outputs and restores their GPU state", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model, surfaces } = await loadGpuCharacter(scene, "KOK_M.CHRM");
    assert.deepEqual(
      surfaces.preservedRenderKeys,
      [-0x47, 0x56, -0x48, 0x57],
    );
    assert.ok(surfaces.groups.every(group => group.controlNode.mesh.isEnabled()));
    const exteriorMesh = model.renderRoot.getChildMeshes(false).find(mesh => (
      mesh._mt5NodeAddress === surfaces.groups[0].controlNode.addr
    ));
    const liningMesh = model.renderRoot.getChildMeshes(false).find(mesh => (
      mesh._mt5NodeAddress === surfaces.groups[0].renderNode.addr
    ));
    assert.equal(exteriorMesh._mt5NativeClothSide, "exterior");
    assert.equal(liningMesh._mt5NativeClothSide, "lining");
    assert.equal(exteriorMesh.material.backFaceCulling, true);
    assert.equal(liningMesh.material.backFaceCulling, true);
    assert.equal(
      exteriorMesh.sideOrientation,
      BABYLON.Material.ClockWiseSideOrientation,
    );
    assert.equal(
      liningMesh.sideOrientation,
      BABYLON.Material.ClockWiseSideOrientation,
    );
    assert.notEqual(exteriorMesh.material, liningMesh.material);
    const meshes = [exteriorMesh, liningMesh];
    const originalPositions = meshes.map(mesh => Float32Array.from(
      mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
    ));
    const originalSkeletons = meshes.map(mesh => mesh.skeleton);
    const state = new NativeClothModelState(model);
    installLanDiControllerPose(model);

    state.update(0);
    assert.ok(meshes.every(mesh => mesh.skeleton === null));
    state.update(1 / 30);
    for (const [meshIndex, mesh] of meshes.entries()) {
      const movedPositions = mesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      );
      assert.ok(movedPositions.some((value, index) => (
        Math.abs(value - originalPositions[meshIndex][index]) > 1e-7
      )));
    }
    // The lining strip borrows its top boundary from the rigid garment.
    // Those vertices keep the body's posed normals instead of acquiring an
    // independently averaged cloth normal at the visible texture seam.
    for (const sourceVertexIndex of [1728, 1735]) {
      assertNormalApproximatelyEqual(
        normalForSourceVertex(liningMesh, sourceVertexIndex),
        normalForSourceVertex(exteriorMesh, sourceVertexIndex),
      );
    }
    // Away from that borrowed boundary, the paired authored lining normal is
    // opposite the exterior normal on every Shenmue I CLTH surface.
    const groupState = state.groups[0];
    const liningLocalVertex = 1;
    const latticeIndex = groupState.topology.latticeToRenderVertexMap.indexOf(
      liningLocalVertex,
    );
    const exteriorLocalVertex = groupState.topology.sourceVertexOrder[
      latticeIndex
    ];
    const exteriorNormal = normalForSourceVertex(
      exteriorMesh,
      surfaces.groups[0].controlNode.model.vertexBase + exteriorLocalVertex,
    );
    const liningNormal = normalForSourceVertex(
      liningMesh,
      surfaces.groups[0].renderNode.model.vertexBase + liningLocalVertex,
    );
    assert.ok(exteriorNormal.reduce(
      (dot, value, axis) => dot + value * liningNormal[axis],
      0,
    ) < -0.999);

    state.release();
    for (const [meshIndex, mesh] of meshes.entries()) {
      assert.equal(mesh.skeleton, originalSkeletons[meshIndex]);
      assert.deepEqual(
        Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
        Array.from(originalPositions[meshIndex]),
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH cloth ownership prevents a second scheduled solver advance", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model } = await loadGpuCharacter(scene, "KOK_M.CHRM");
    const state = new NativeClothModelState(model);
    installLanDiControllerPose(model);
    const owner = Symbol("AUTH activity");

    assert.equal(state.beginPresentation(owner), true);
    assert.equal(state.update(1 / 30, owner), true);
    const authoredPositions = state.groups.map(group => (
      group.simulation.currentPositions()
    ));

    assert.equal(state.update(1 / 30), false);
    assert.deepEqual(
      state.groups.map(group => group.simulation.currentPositions()),
      authoredPositions,
    );
    assert.equal(state.endPresentation(owner), true);
    assert.equal(state.update(1 / 30), true);
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH camera-shot ownership preserves one continuous cloth epoch", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model } = await loadGpuCharacter(scene, "KOK_M.CHRM");
    const state = new NativeClothModelState(model);
    installLanDiControllerPose(model);
    const firstShot = Symbol("AUTH shot one");
    const secondShot = Symbol("AUTH shot two");
    state.beginPresentation(firstShot);
    state.update(1 / 30, firstShot);
    const solved = state.groups.map(group => group.simulation.currentPositions());
    state.endPresentation(firstShot, { preserveState: true });
    state.beginPresentation(secondShot);
    assert.deepEqual(
      state.groups.map(group => group.simulation.currentPositions()),
      solved,
    );
    state.endPresentation(secondShot);
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("Lan Di's authored panels settle instead of alternating native frames", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model } = await loadGpuCharacter(scene, "KOK_M.CHRM");
    const state = new NativeClothModelState(model);
    installLanDiControllerPose(model);
    state.update(0);
    for (let frame = 0; frame < 240; frame += 1) state.update(1 / 30);
    const settled = state.groups.map(group => (
      group.simulation.currentPositions()
    ));

    state.update(1 / 30);
    const next = state.groups.map(group => (
      group.simulation.currentPositions()
    ));
    const maximumDelta = Math.max(...next.flatMap((group, groupIndex) => (
      group.flatMap((point, pointIndex) => point.map((value, axis) => (
        Math.abs(value - settled[groupIndex][pointIndex][axis])
      )))
    )));
    assert.ok(maximumDelta < 1e-8, `settled delta ${maximumDelta}`);
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("gameplay cloth follows its actor between native solver ticks", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    // Haru Hirata (HIRA) uses TUB_L in Dobuita. Her closed skirt made the
    // render-rate/fixed-rate disagreement especially visible, so retain that
    // real garment as the regression rather than a synthetic surface.
    const { model } = await loadGpuCharacter(scene, "TUB_L.CHRM");
    const actorRoot = new BABYLON.TransformNode("scheduled_HIRA", scene);
    model.renderRoot.parent = actorRoot;
    model.root = actorRoot;
    const state = new NativeClothModelState(model);
    installCompleteControllerPose(model);
    assert.equal(state.update(0), true);
    const mesh = state.groups[0].exteriorOutput.meshes[0].mesh;
    const initialLocalPositions = Array.from(mesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));

    actorRoot.position.x = 0.2;
    actorRoot.computeWorldMatrix(true);
    state.update(1 / 60);
    assert.deepEqual(
      Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
      initialLocalPositions,
    );

    actorRoot.position.x = 0.4;
    actorRoot.computeWorldMatrix(true);
    assert.equal(state.update(1 / 60), true);
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("body-owned cloth boundaries follow sub-frame poses without reprojecting simulated vertices", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  try {
    for (const code of ["SIA_L", "HPD_L", "HPX_L", "HOS_L", "INE_M"]) {
      const scene = new BABYLON.Scene(engine);
      try {
        const { model } = await loadGpuCharacter(scene, `${code}.CHRM`);
        installCompleteControllerPose(model);
        const state = nativeClothStateForModel(model);
        assert.equal(state.update(0), true);
        const snapshots = new Map(state.groups.flatMap(group => group.outputs.flatMap(output => (
          output.meshes.map(({ mesh }) => [mesh, Array.from(mesh.getVerticesData("position"))])
        ))));
        const before = model.loader.characterRigWorldMatrices(model.renderRoot);
        const delta = BABYLON.Matrix.RotationZ(0.01).multiply(BABYLON.Matrix.Translation(0.003, 0.002, 0));
        const after = new Map([...before].map(([address, matrix]) => [address,
          BABYLON.Matrix.FromArray(matrix).multiply(delta).asArray()]));
        model.loader.applyCharacterRigResolvedWorldMatrices(model.renderRoot, after);
        // Also move the owner, exercising the old counter-translation failure.
        model.root.position.x += 0.1;
        state.update(1 / 60);
        let boundaryCopies = 0;
        for (const group of state.groups) for (const output of group.outputs) {
          for (const { mesh } of output.meshes) {
            const positions = mesh.getVerticesData("position");
            const normals = mesh.getVerticesData("normal");
            mesh._mt5SourceVertexIndices.forEach((sourceIndex, index) => {
              const actual = Array.from(positions.slice(index * 3, index * 3 + 3));
              if (!output.externalSourceVertexIndices.includes(sourceIndex)) {
                assert.deepEqual(actual, snapshots.get(mesh).slice(index * 3, index * 3 + 3), `${code}: hold simulated local point`);
                return;
              }
              const owner = model.renderRoot._mt5Nodes.find(node => node.model
                && sourceIndex >= node.model.vertexBase && sourceIndex < node.model.vertexBase + node.model.nbVertex);
              const vertex = model.loader.globalVertices[sourceIndex];
              const matrix = BABYLON.Matrix.FromArray(after.get(owner.addr));
              const point = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(vertex.sourcePos), matrix);
              const normal = BABYLON.Vector3.TransformNormal(BABYLON.Vector3.FromArray(vertex.sourceNorm), matrix).normalize();
              assertNormalApproximatelyEqual(actual, point.asArray());
              assertNormalApproximatelyEqual(Array.from(normals.slice(index * 3, index * 3 + 3)), normal.asArray());
              boundaryCopies++;
            });
          }
        }
        assert.ok(boundaryCopies > 0, `${code}: actual borrowed body vertices checked`);
        state.release();
      } finally { scene.dispose(); }
    }
  } finally { engine.dispose(); }
});

test("borrowed player jacket returns to authored GPU skinning after multiple AUTH shots", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model } = await loadPlayableRyo(scene, "gpu");
    const meshes = model.renderRoot.getChildMeshes().filter(mesh => mesh._mt5NativeClothOutput);
    assert.ok(meshes.length > 0);
    // Babylon uploads Float32 buffers; loader-side arrays can still hold JS
    // doubles. Compare the restored buffers exactly at their GPU precision.
    const authored = meshes.map(mesh => ({ mesh, skeleton: mesh.skeleton,
      positions: Array.from(Float32Array.from(mesh.getVerticesData("position"))),
      normals: Array.from(Float32Array.from(mesh.getVerticesData("normal"))) }));
    const actors = createNativeAseqBabylonActors({
      getPlayerModel: () => model,
      syncPlayerTransform() {},
      scheduledActors: { beginActivityActors: () => [], activityActor() {}, endActivityActors: () => true },
      motionRuntime: { applyActivitySequence(actorModel) {
        installCompleteControllerPose(actorModel);
        return true;
      } },
    });
    const cloth = createNativeClothPresentation({ actors });
    const program = {};
    actors.beginProgram(program, ["AKIR"]);
    for (let shot = 0; shot < 3; shot++) {
      const owner = { shot };
      actors.begin(owner, ["AKIR"]);
      actors.applyMotion(owner, "AKIR", {});
      cloth.begin(owner, ["AKIR"]);
      cloth.apply(owner);
      assert.ok(meshes.every(mesh => mesh.skeleton === null));
      cloth.end(owner);
      actors.end(owner, "complete");
    }
    actors.endProgram(program, "complete");
    cloth.reset();
    for (const { mesh, skeleton, positions, normals } of authored) {
      assert.ok(mesh.skeleton === skeleton, "cleanup must restore the original skeleton, not another shot's detached state");
      assert.equal(mesh.computeBonesUsingShaders, true);
      assert.deepEqual(Array.from(mesh.getVerticesData("position")), positions);
      assert.deepEqual(Array.from(mesh.getVerticesData("normal")), normals);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("render-only gameplay releases borrowed native cloth and cannot reacquire stale controls", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model } = await loadPlayableRyo(scene, "gpu");
    const runtime = new CharacterRuntime({
      scene,
      renderMatrixByKey: new Map(),
      fetchArrayBuffer() {},
    });
    runtime.presentationModels.set(model.renderRoot, model);
    const clothState = nativeClothStateForModel(model);
    const routes = model.loader.characterRigWorldMatrices(model.renderRoot);
    const meshes = model.renderRoot.getChildMeshes().filter(mesh => mesh._mt5NativeClothOutput);
    const skeletons = meshes.map(mesh => mesh.skeleton);
    assert.ok(meshes.length > 0);
    for (let cycle = 0; cycle < 2; cycle++) {
      installCompleteControllerPose(model);
      const nativePose = {
        model,
        controllerFamily: model.latestControllerFamily,
        controllerMatrices: model.latestControllerMatrices,
        renderMatrixByKey: new Map(),
      };
      runtime.applyCharacterRigWorldMatrices(model.loader, model.renderRoot, routes, nativePose);
      assert.ok(model.latestControllerFamily === nativePose.controllerFamily);
      assert.ok(model.latestControllerMatrices === nativePose.controllerMatrices);
      assert.equal(runtime.updateSecondaryMotion(model.renderRoot, 1 / 30), true);
      assert.ok(meshes.every(mesh => mesh.skeleton === null));

      // Exercise the animation boundary independently of program cleanup.
      runtime.applyCharacterRigWorldMatrices(model.loader, model.renderRoot, routes);
      assert.equal(model.latestControllerFamily, null);
      assert.equal(model.latestControllerRenderMatrixByKey, null);
      assert.equal(model.latestControllerMatrices, null);
      assert.ok(model.latestRetargetedRoutes === routes);
      for (let frame = 0; frame < 3; frame++) {
        // No fresh native pose is available. The shared post-pose stage must
        // remain inactive instead of reacquiring cinematic controller data.
        assert.equal(runtime.updateSecondaryMotion(model.renderRoot, 1 / 60), false);
        assert.equal(clothState.acquired, false);
        assert.ok(meshes.every((mesh, i) => mesh.skeleton === skeletons[i]));
        assert.ok(meshes.every(mesh => mesh.computeBonesUsingShaders));
      }
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("playable Ryo retains authored jacket exteriors and linings", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model, surfaces } = await loadPlayableRyo(scene);
    assert.deepEqual(
      surfaces.preservedRenderKeys,
      [-0x49, 0x58, -0x4a, 0x59],
    );
    for (const group of surfaces.groups) {
      const exterior = model.renderRoot.getChildMeshes(false).find(mesh => (
        mesh._mt5NodeAddress === group.controlNode.addr
      ));
      const lining = model.renderRoot.getChildMeshes(false).find(mesh => (
        mesh._mt5NodeAddress === group.renderNode.addr
      ));
      assert.equal(exterior._mt5NativeClothSide, "exterior");
      assert.equal(lining._mt5NativeClothSide, "lining");
      assert.equal(exterior.material.backFaceCulling, true);
      assert.equal(lining.material.backFaceCulling, true);
      assert.notEqual(
        exterior.metadata.mt5TextureId,
        lining.metadata.mt5TextureId,
      );
    }

    const state = new NativeClothModelState(model);
    installCompleteControllerPose(model);
    assert.equal(state.update(0), true);
    assert.equal(state.update(1 / 30), true);
    assert.ok(state.groups.every(group => (
      group.simulation.positions.flat().every(Number.isFinite)
    )));
    const upperJacket = model.renderRoot.getChildMeshes(false).find(mesh => (
      mesh._mt5NodeAddress === 0xce48
      && mesh.name === "mt5_tex_0"
    ));
    const lowerJacket = model.renderRoot.getChildMeshes(false).find(mesh => (
      mesh._mt5NodeAddress === 0xd348
      && mesh.name === "mt5_tex_0"
    ));
    for (const sourceVertexIndex of [43, 44]) {
      assertNormalApproximatelyEqual(
        normalForSourceVertex(lowerJacket, sourceVertexIndex),
        normalForSourceVertex(upperJacket, sourceVertexIndex),
      );
    }
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native cloth adapter accepts the authored closed Ine-san skirt", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const { model, surfaces } = await loadGpuCharacter(scene, "INE_M.CHRM");
    const state = new NativeClothModelState(model);
    assert.equal(surfaces.groups.length, 1);
    assert.equal(state.groups[0].topology.closedColumns, true);
    assert.doesNotThrow(() => state.update(1 / 30));
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("OP02 replays Shenhua's captured local cloth through the real MT5 surface", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const model = await loadOp02Shenhua(scene);
    const bytes = fs.readFileSync(
      "play/assets/introduction/op02/MGR_CLOTH_TRACK.bin",
    );
    const track = parseNativeClothTrack(bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ));
    const state = new NativeClothModelState(model);
    const originalPositions = state.groups.flatMap(group => (
      group.outputs.flatMap(output => output.meshes.map(surface => (
        Array.from(surface.mesh.getVerticesData(
          BABYLON.VertexBuffer.PositionKind,
        ))
      )))
    ));
    const owner = {};
    const first = track.coordinates[0];
    assert.equal(state.beginPresentation(owner, {
      capturedTrack: track,
      activitySlot: first.slot,
    }), true);
    assert.equal(state.update(1 / 30, owner, {
      activityFrame: first.frame,
    }), true);
    const clothPositions = state.groups.flatMap(group => (
      group.outputs.flatMap(output => output.meshes.flatMap(surface => (
        Array.from(surface.mesh.getVerticesData(
          BABYLON.VertexBuffer.PositionKind,
        ))
      )))
    ));
    assert.ok(clothPositions.length > 0);
    assert.ok(clothPositions.every(Number.isFinite));
    assert.ok(Math.max(...clothPositions.map(Math.abs)) < 20);
    assert.equal(state.endPresentation(owner, { preserveState: true }), true);
    const nextOwner = {};
    assert.equal(state.beginPresentation(nextOwner, {
      capturedTrack: track,
      activitySlot: first.slot,
    }), true);
    assert.equal(state.update(1 / 30, nextOwner, {
      activityFrame: first.frame + 1,
    }), true);
    assert.equal(state.endPresentation(nextOwner, { preserveState: true }), true);
    state.reset();
    assert.equal(state.capturedActivitySlot, null);
    assertNestedValuesApproximatelyEqual(state.groups.flatMap(group => (
      group.outputs.flatMap(output => output.meshes.map(surface => (
        Array.from(surface.mesh.getVerticesData(
          BABYLON.VertexBuffer.PositionKind,
        ))
      )))
    )), originalPositions);
    const replayOwner = {};
    assert.equal(state.beginPresentation(replayOwner, {
      capturedTrack: track,
      activitySlot: first.slot,
    }), true);
    assert.equal(state.update(1 / 30, replayOwner, {
      activityFrame: Math.max(0, first.frame - 1),
    }), false);
    assertNestedValuesApproximatelyEqual(state.groups.flatMap(group => (
      group.outputs.flatMap(output => output.meshes.map(surface => (
        Array.from(surface.mesh.getVerticesData(
          BABYLON.VertexBuffer.PositionKind,
        ))
      )))
    )), originalPositions);
    assert.equal(state.endPresentation(replayOwner), true);
    state.release();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("every bundled Shenmue I cloth output has a complete dynamic boundary", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  let renderedGroups = 0;
  try {
    for (const entry of modelInventory.models) {
      const scene = new BABYLON.Scene(engine);
      try {
        const { model } = await loadGpuCharacter(scene, entry.modelFile);
        const state = new NativeClothModelState(model);
        installCompleteControllerPose(model);
        const expectedUpdate = state.groups.length > 0;
        assert.equal(state.update(0), expectedUpdate, entry.modelFile);
        assert.equal(state.update(1 / 30), expectedUpdate, entry.modelFile);
        for (const seam of state.seamGroups) {
          const owners = new Set(seam.map(vertex => state.groups[vertex.nodeIndex].group.controlNode.parentAddr));
          assert.equal(owners.size, 1, `${entry.modelFile}: weld only a shared attachment owner`);
          const points = seam.map(vertex => Array.from(vertex.child.getVerticesData("position")
            .slice(vertex.vertexIndex * 3, vertex.vertexIndex * 3 + 3)));
          for (const point of points) assert.deepEqual(point, points[0], `${entry.modelFile}: connected garment seam`);
        }
        renderedGroups += state.groups.length;
        state.release();
      } finally {
        scene.dispose();
      }
    }
  } finally {
    engine.dispose();
  }
  assert.equal(renderedGroups, modelInventory.summary.clothGroupCount);
});
