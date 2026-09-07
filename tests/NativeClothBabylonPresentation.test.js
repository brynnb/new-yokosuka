import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  NativeClothModelState,
} from "../play/characters/NativeClothBabylonPresentation.js";
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

async function loadPlayableRyo(scene) {
  const loader = new Mt5Loader(scene, {
    characterRigMode: "baked",
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
    assert.equal(state.update(1 / 60), false);
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
