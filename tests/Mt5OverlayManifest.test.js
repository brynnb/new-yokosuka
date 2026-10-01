import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { PACKAGED_VIEWER_ASSETS } from "../src/PackagedViewerAssets.js";
import overlayManifest from "../play/data/mt5-overlay-manifest.json" with { type: "json" };
import { mapSourcesForCatalog } from "../tools/assets/generate_mt5_overlay_manifest.js";

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

test("overlap extraction uses the browser's packaged maps, including non-MAP catalog names", () => {
  const flat = new Map([
    ["S1_OP02_MAP.MT5", "stale/S1_OP02_MAP.MT5"],
    ["S1_JOMO_MAP.MT5", "public/models/S1_JOMO_MAP.MT5"],
  ]);
  assert.deepEqual(mapSourcesForCatalog([
    "S1_OP02_MAP.MT5", "S1_OP00_OMO.MT5", "S1_JOMO_MAP.MT5",
    "S1_OP00_BMWS703G.MT5", "G_VENDING_JIHS5KNG.MT5",
  ], flat), [
    { filename: "S1_JOMO_MAP.MT5", localFilename: "public/models/S1_JOMO_MAP.MT5" },
    { filename: "S1_OP00_OMO.MT5", localFilename: PACKAGED_VIEWER_ASSETS["S1_OP00_OMO.MT5"] },
    { filename: "S1_OP02_MAP.MT5", localFilename: PACKAGED_VIEWER_ASSETS["S1_OP02_MAP.MT5"] },
  ]);
});

test("packaged opening terrain receives its generated bias without losing or moving triangles", {
  skip: !existsSync(PACKAGED_VIEWER_ASSETS["S1_OP02_MAP.MT5"]) && "requires extracted OP02 map",
}, async () => {
  const filename = "S1_OP02_MAP.MT5";
  const data = readFileSync(PACKAGED_VIEWER_ASSETS[filename]);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const engine = new BABYLON.NullEngine();
  const original = new BABYLON.Scene(engine);
  const processed = new BABYLON.Scene(engine);
  const triangles = root => root.getChildMeshes().flatMap(mesh => {
    const positions = mesh.getVerticesData("position");
    const indices = mesh.getIndices();
    return Array.from({ length: indices.length / 3 }, (_, face) => JSON.stringify(
      Array.from(indices.slice(face * 3, face * 3 + 3)).flatMap(index =>
        Array.from(positions.slice(index * 3, index * 3 + 3))),
    ));
  }).sort();
  try {
    const [raw] = await new Mt5Loader(original).load(buffer, null, { sourceFilename: filename });
    const result = detectMt5OverlayFaces(original);
    assert.deepEqual(overlayManifest.files[filename], {
      byteLength: buffer.byteLength, ...result,
    }, "checked-in definition matches canonical geometry analysis");
    const [root] = await new Mt5Loader(processed, { overlayManifest }).load(buffer, null, { sourceFilename: filename });
    const overlays = root.getChildMeshes().filter(mesh => mesh.metadata?.mt5DepthOverlay);
    assert.equal(overlays.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0), 5);
    assert.deepEqual(triangles(root), triangles(raw), "all original terrain faces keep their exact positions");
    for (const mesh of overlays) {
      assert.equal(mesh.material.zOffset, -1);
      assert.equal(mesh.material.zOffsetUnits, -1);
      assert.equal(mesh.isEnabled(), true);
    }
  } finally {
    original.dispose();
    processed.dispose();
    engine.dispose();
  }
});

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

for (const mode of ["opaque", "alphatest", "blend"]) {
  for (const wholeMesh of [false, true]) {
    test(`preserves ${mode} transparency when biasing ${wholeMesh ? "all" : "some"} faces`, () => {
      const engine = new BABYLON.NullEngine();
      const scene = new BABYLON.Scene(engine);
      try {
        const modelRoot = new BABYLON.TransformNode("model", scene);
        const node = new BABYLON.TransformNode("node_100", scene);
        node._mt5Node = { addr: 0x100 };
        node.parent = modelRoot;
        const source = meshForTriangles(scene, node, 3, [
          0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0,
        ], [0, 1, 2, 1, 3, 2]);
        const material = source.material;
        const texture = BABYLON.RawTexture.CreateRGBATexture(
          new Uint8Array([255, 255, 255, 96]), 1, 1, scene, false, false,
        );
        material.diffuseTexture = texture;
        texture.hasAlpha = mode !== "opaque";
        material.useAlphaFromDiffuseTexture = texture.hasAlpha;
        material.transparencyMode = {
          opaque: BABYLON.Material.MATERIAL_OPAQUE,
          alphatest: BABYLON.Material.MATERIAL_ALPHATEST,
          blend: BABYLON.Material.MATERIAL_ALPHABLEND,
        }[mode];
        material._mt5AlphaMode = mode;
        source.hasVertexAlpha = texture.hasAlpha;
        source.alphaIndex = mode === "blend" ? 1000 : 500;
        source.setVerticesData("color", [
          1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 0.25, 1, 1, 1, 1,
        ]);
        const [overlay] = applyMt5OverlayDefinition(modelRoot, {
          overlays: [{ nodeAddress: 0x100, textureId: 3, rank: 1,
            faceIds: wholeMesh ? [0, 1] : [1] }],
        });

        assert.notEqual(overlay.material, material, "depth bias does not mutate the shared source material");
        assert.equal(overlay.material.diffuseTexture.hasAlpha, texture.hasAlpha);
        assert.equal(overlay.material.useAlphaFromDiffuseTexture, material.useAlphaFromDiffuseTexture);
        assert.equal(overlay.material.transparencyMode, material.transparencyMode);
        assert.equal(overlay.material._mt5AlphaMode, mode);
        assert.equal(overlay.hasVertexAlpha, mode !== "opaque");
        assert.equal(overlay.alphaIndex, source.alphaIndex);
        assert.equal(overlay.material.needAlphaBlendingForMesh(overlay), mode === "blend");
        assert.equal(overlay.material.needAlphaTestingForMesh(overlay), mode === "alphatest");
        assert.equal(overlay.material.zOffset, -1);
        assert.equal(material.zOffset, 0);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    });
  }
}

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
