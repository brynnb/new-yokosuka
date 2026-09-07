import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import {
  applyMt5OverlayDefinition,
  MAXIMUM_DEPTH_OVERLAY_RANK,
  overlayDefinitionForFile,
} from "../src/Mt5OverlayManifest.js";
import {
  detectMt5OverlayFaces,
  overlayRanksForEdges,
} from "../tools/assets/mt5_overlay_analyzer.js";

function meshForTriangles(scene, parent, textureId, positions, indices) {
  const mesh = new BABYLON.Mesh(`mt5_tex_${textureId}`, scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = [];
  BABYLON.VertexData.ComputeNormals(
    vertexData.positions,
    vertexData.indices,
    vertexData.normals,
  );
  vertexData.uvs = Array.from(
    { length: positions.length / 3 * 2 },
    () => 0,
  );
  vertexData.applyToMesh(mesh);
  mesh.parent = parent;
  mesh.material = new BABYLON.StandardMaterial(
    `material_${textureId}`,
    scene,
  );
  return mesh;
}

test("geometrically classifies contained facade details as overlays", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("root", scene);
    root._mt5Node = { addr: 0x100 };
    meshForTriangles(
      scene,
      root,
      17,
      [
        -2, -2, 0,
        2, -2, 0,
        -2, 2, 0,
        2, 2, 0,
      ],
      [0, 1, 2, 1, 3, 2],
    );
    meshForTriangles(
      scene,
      root,
      3,
      [
        -0.5, -0.5, 0.002,
        0.5, -0.5, 0.002,
        -0.5, 0.5, 0.002,
        0.5, 0.5, 0.002,
      ],
      [0, 1, 2, 1, 3, 2],
    );

    const result = detectMt5OverlayFaces(scene);
    assert.deepEqual(result.overlays, [{
      nodeAddress: 0x100,
      textureId: 3,
      rank: 1,
      faceIds: [0, 1],
      minimumCoverage: 1,
      maximumPlaneDistance: 0.002,
    }]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("collapses cyclic overlay relationships before assigning ranks", () => {
  const ranks = overlayRanksForEdges(
    ["base", "cycle-a", "cycle-b", "front"],
    [
      ["base", "cycle-a"],
      ["cycle-a", "cycle-b"],
      ["cycle-b", "cycle-a"],
      ["cycle-b", "front"],
    ],
  );

  assert.equal(ranks.get("base"), 0);
  assert.equal(ranks.get("cycle-a"), 1);
  assert.equal(ranks.get("cycle-b"), 1);
  assert.equal(ranks.get("front"), 2);
});

test("splits only manifested faces and applies constant depth bias", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const modelRoot = new BABYLON.TransformNode("model", scene);
    const node = new BABYLON.TransformNode("node_100", scene);
    node._mt5Node = { addr: 0x100 };
    node.parent = modelRoot;
    const source = meshForTriangles(
      scene,
      node,
      3,
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        1, 1, 0,
      ],
      [0, 1, 2, 1, 3, 2],
    );
    source.material.diffuseTexture = BABYLON.RawTexture.CreateRGBATexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      scene,
      false,
      false,
    );
    source.material.diffuseTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    source.material.diffuseTexture.wrapV = BABYLON.Texture.MIRROR_ADDRESSMODE;
    source.material.diffuseTexture.wrapR = BABYLON.Texture.WRAP_ADDRESSMODE;

    const overlays = applyMt5OverlayDefinition(modelRoot, {
      overlays: [{
        nodeAddress: 0x100,
        textureId: 3,
        rank: 1,
        faceIds: [1],
      }],
    });

    assert.equal(source.getIndices().length / 3, 1);
    assert.deepEqual(source._mt5OriginalFaceIds, [0]);
    assert.equal(overlays.length, 1);
    assert.equal(overlays[0].getIndices().length / 3, 1);
    assert.deepEqual(overlays[0]._mt5OriginalFaceIds, [1]);
    assert.equal(overlays[0].material.zOffset, -1);
    assert.equal(overlays[0].material.zOffsetUnits, -1);
    assert.equal(
      overlays[0].material.diffuseTexture.wrapU,
      BABYLON.Texture.WRAP_ADDRESSMODE,
    );
    assert.equal(
      overlays[0].material.diffuseTexture.wrapV,
      BABYLON.Texture.MIRROR_ADDRESSMODE,
    );
    assert.equal(
      overlays[0].material.diffuseTexture.wrapR,
      BABYLON.Texture.WRAP_ADDRESSMODE,
    );
    assert.equal(overlays[0].metadata.mt5DepthOverlay, true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("caps malformed manifest ranks before applying depth bias", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const modelRoot = new BABYLON.TransformNode("model", scene);
    const node = new BABYLON.TransformNode("node_100", scene);
    node._mt5Node = { addr: 0x100 };
    node.parent = modelRoot;
    meshForTriangles(
      scene,
      node,
      3,
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ],
      [0, 1, 2],
    );

    const [overlay] = applyMt5OverlayDefinition(modelRoot, {
      overlays: [{
        nodeAddress: 0x100,
        textureId: 3,
        rank: 1008,
        faceIds: [0],
      }],
    });

    assert.equal(overlay.material.zOffset, -MAXIMUM_DEPTH_OVERLAY_RANK);
    assert.equal(overlay.material.zOffsetUnits, -MAXIMUM_DEPTH_OVERLAY_RANK);
    assert.equal(
      overlay.metadata.mt5DepthOverlayRank,
      MAXIMUM_DEPTH_OVERLAY_RANK,
    );
    assert.equal(overlay.metadata.mt5DepthOverlayManifestRank, 1008);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("rejects a manifest generated from different model bytes", () => {
  const definition = { byteLength: 120, overlays: [] };
  const manifest = { files: { "S2_MFSY_MAP11.MT5": definition } };

  assert.equal(
    overlayDefinitionForFile(
      manifest,
      "/models/S2_MFSY_MAP11.MT5",
      120,
    ),
    definition,
  );
  assert.equal(
    overlayDefinitionForFile(
      manifest,
      "S2_MFSY_MAP11.MT5",
      121,
    ),
    null,
  );
});
