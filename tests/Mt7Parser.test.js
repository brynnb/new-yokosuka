import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  isMt7,
  mt7BatchTriangleIndices,
  mt7TriangleIndices,
  parseMt7,
} from "../src/Mt7Parser.js";
import {
  indexMt7TexturePack,
  Mt7Loader,
  mt7BrowserVector,
  mt7MaterialState,
  mt7RotationQuaternion,
  mt7SamplerState,
  mt7TextureAddressModes,
  mt7TextureCoordinates,
  resolveMt7TextureEntry,
} from "../src/Mt7Loader.js";

function fixture() {
  const bytes = new Uint8Array(0x180);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  const u32 = (offset, value) => view.setUint32(offset, value >>> 0, true);
  const i32 = (offset, value) => view.setInt32(offset, value, true);
  const f32 = (offset, value) => view.setFloat32(offset, value, true);

  ascii(0, "MDO7");
  u32(4, bytes.length);
  u32(8, 0x10);
  u32(12, 0);
  u32(0x10, (3 << 16) | 0xffff);
  f32(0x10 + 28, 1);
  f32(0x10 + 32, 1);
  f32(0x10 + 36, 1);
  u32(0x10 + 40, 0x50);

  u32(0x50, 1);
  u32(0x54, 1);
  f32(0x50 + 20, 1);
  u32(0x50 + 24, 0x80000000);
  u32(0x50 + 36, 3 << 26);
  u32(0x50 + 56, 3);
  u32(0x50 + 100, 8 + 3 * 32);
  u32(0x50 + 104, 0x56);
  u32(0x50 + 108, 3);
  let cursor = 0x50 + 112;
  for (const position of [[0, 0, 0], [1, 0, 0], [0, 1, 0]]) {
    for (const value of position) { f32(cursor, value); cursor += 4; }
    for (const value of [0, 0, 1]) { f32(cursor, value); cursor += 4; }
    for (const value of [position[0], position[1]]) { f32(cursor, value); cursor += 4; }
  }
  return bytes;
}

function twoGroupFixture() {
  const bytes = new Uint8Array(0x280);
  bytes.set(fixture());
  const view = new DataView(bytes.buffer);
  view.setUint32(4, bytes.length, true);
  const secondGroup = 0x120;
  view.setUint32(secondGroup, 0x80000000, true);
  view.setUint32(secondGroup + 32, 7, true);
  view.setUint32(secondGroup + 76, 8 + 3 * 32, true);
  view.setUint32(secondGroup + 80, 0x56, true);
  view.setUint32(secondGroup + 84, 3, true);
  let cursor = secondGroup + 88;
  for (const position of [[0, 0, 1], [1, 0, 1], [0, 1, 1]]) {
    for (const value of position) { view.setFloat32(cursor, value, true); cursor += 4; }
    for (const value of [0, 0, 1]) { view.setFloat32(cursor, value, true); cursor += 4; }
    for (const value of [position[0], position[1]]) {
      view.setFloat32(cursor, value, true);
      cursor += 4;
    }
  }
  view.setUint32(cursor + 4, 6, true);
  return bytes;
}

test("parses a bounded Dreamcast MT7 node and vertex batch", () => {
  const bytes = fixture();
  assert.equal(isMt7(bytes), true);
  const model = parseMt7(bytes);
  assert.equal(model.signature, "MDO7");
  assert.equal(model.nodes.length, 1);
  assert.equal(model.nodes[0].id, (3 << 16) | 0xffff);
  assert.equal(model.nodes[0].mesh.textureIndex, 3);
  assert.equal(model.nodes[0].mesh.textureControlPixelFormat, 3);
  assert.deepEqual(model.nodes[0].mesh.batches[0].vertices[1].position, [1, 0, 0]);
  assert.deepEqual(mt7TriangleIndices(4), [0, 1, 2, 1, 3, 2]);
});

test("emits explicit MT7 triangle-list batches without strip stitching", () => {
  const batch = {
    primitive: "triangles",
    reverseWinding: false,
    vertices: Array.from({ length: 6 }, () => ({})),
  };
  assert.deepEqual(mt7BatchTriangleIndices(batch), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(
    mt7BatchTriangleIndices({ ...batch, reverseWinding: true }),
    [0, 2, 1, 3, 5, 4],
  );
});

test("KP5 retail triangle lists match the converted Xbox head topology", () => {
  const filename = "play/assets/shenmue2-characters/KP5_L.CHRM";
  if (!fs.existsSync(filename)) return;
  const model = parseMt7(fs.readFileSync(filename));
  const head = model.nodes.find((node) => (node.id & 0xffff) === 0xffbd);
  const triangles = head.mesh.materialGroups.reduce((total, group) => (
    total + group.batches.reduce(
      (count, batch) => count + mt7BatchTriangleIndices(batch).length / 3,
      0,
    )
  ), 0);
  assert.equal(triangles, 261);
  assert.equal(model.warnings.length, 0);
  const terminal = head.mesh.materialGroups[0].batches.at(-1);
  assert.equal(terminal.baseType, 0x6a);
  assert.equal(terminal.primitive, "triangles");
  assert.equal(terminal.primitiveCount, 8);
  assert.equal(terminal.vertices.length, 24);
});

test("decodes MT7 packed normals and ARGB colors selected by polygon control", () => {
  const bytes = fixture();
  const view = new DataView(bytes.buffer);
  const material = 0x50 + 24;
  const firstVertex = 0x50 + 112;
  view.setUint32(material, 0x8000009c, true);
  view.setUint32(firstVertex + 12, 0x00f47e0e, true);
  view.setUint32(firstVertex + 16, 0xffb2b2b2, true);
  view.setUint32(firstVertex + 20, 0x00102030, true);

  const group = parseMt7(bytes).nodes[0].mesh.materialGroups[0];
  const vertex = group.batches[0].vertices[0];
  assert.equal(group.vertexEncoding, "packed-normal-color");
  assert.deepEqual(vertex.normal, [14 / 127, 126 / 127, -12 / 127]);
  assert.deepEqual(vertex.color, [178 / 255, 178 / 255, 178 / 255, 1]);
  assert.deepEqual(vertex.offsetColor, [16 / 255, 32 / 255, 48 / 255, 0]);
  assert.ok(vertex.normal.every(Number.isFinite));
});

test("parses every material group before the MT7 mesh terminator", () => {
  const bytes = twoGroupFixture();
  const mesh = parseMt7(bytes).nodes[0].mesh;
  assert.equal(mesh.materialGroupCount, 2);
  assert.equal(mesh.totalVertexCount, 6);
  assert.deepEqual(mesh.materialGroups.map((group) => group.textureIndex), [3, 7]);
  assert.equal(mesh.batches.length, 2);
});

test("retains complete strips before a genuinely unsupported MT7 command", () => {
  const bytes = fixture();
  const view = new DataView(bytes.buffer);
  const mesh = 0x50;
  const unsupportedCommand = 0x120;
  view.setUint32(mesh + 100, 8 + 3 * 32 + 8, true);
  view.setUint32(unsupportedCommand, 0x68, true);
  view.setUint32(unsupportedCommand + 4, 6, true);

  const model = parseMt7(bytes);
  const group = model.nodes[0].mesh.materialGroups[0];
  assert.equal(group.batches.length, 1);
  assert.equal(group.batches[0].vertices.length, 3);
  assert.match(group.warning, /unsupported MT7 vertex type 0x68/);
  assert.equal(model.nodes[0].mesh.totalVertexCount, 0);
});

test("renders JN1's strips and terminal 0x6a face triangles", () => {
  const filename = new URL(
    "../play/assets/shenmue2-characters/JN1_L.CHRM",
    import.meta.url,
  );
  const bytes = fs.readFileSync(filename);
  const model = parseMt7(bytes);
  const head = model.nodes.find((node) => (node.id & 0xffff) === 0xffbd);
  assert.ok(head?.mesh);
  assert.ok(head.mesh.batches.length > 20);
  assert.equal(model.warnings.length, 0);
  const terminal = head.mesh.materialGroups[0].batches.at(-1);
  assert.equal(terminal.baseType, 0x6a);
  assert.equal(terminal.primitive, "triangles");

  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const root = new Mt7Loader(scene).load(bytes, null, {
    sourceFilename: "JN1_L.CHRM",
  })[0];
  const loadedHead = root._mt7Nodes.find(({ sourceNode }) => (
    (sourceNode.id & 0xffff) === 0xffbd
  ));
  const faceMeshes = loadedHead.transform.getChildMeshes(true)
    .filter((mesh) => mesh.parent === loadedHead.transform);
  assert.ok(faceMeshes.length > 20);
  assert.ok(faceMeshes.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0) > 400);
  root.dispose();
  scene.dispose();
  engine.dispose();
});

test("rejects out-of-bounds MT7 pointers", () => {
  const bytes = fixture();
  new DataView(bytes.buffer).setUint32(8, 0xffff, true);
  assert.throws(() => parseMt7(bytes), /exceeds MT7 bounds/);
});

test("resolves compact records through their complete referenced vertex", () => {
  const bytes = fixture();
  const view = new DataView(bytes.buffer);
  const mesh = 0x50;
  const firstVertex = mesh + 112;
  const reference = firstVertex + 32;
  const recordEnd = reference + 8;
  const geometryRelative = firstVertex - recordEnd;
  view.setUint32(mesh + 100, 8 + 32 + 8, true);
  view.setUint32(mesh + 108, 2, true);
  view.setUint32(reference, 0x5f123456, true);
  view.setInt32(reference + 4, geometryRelative, true);
  const model = parseMt7(bytes);
  const vertices = model.nodes[0].mesh.batches[0].vertices;
  assert.equal(vertices[1].referenced, true);
  assert.equal(vertices[1].referenceControl, 0x5f123456);
  assert.deepEqual(vertices[1].position, vertices[0].position);
  assert.deepEqual(vertices[1].uv, vertices[0].uv);
});

test("indexes Shenmue II external texture packs by their authored IDs", () => {
  const firstPayload = Uint8Array.from([1, 2, 3, 4]);
  const secondPayload = Uint8Array.from([5, 6]);
  const bytes = new Uint8Array(12 + firstPayload.length + 12 + secondPayload.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("FIRST001"), 0);
  view.setUint32(8, firstPayload.length, true);
  bytes.set(firstPayload, 12);
  const second = 12 + firstPayload.length;
  bytes.set(new TextEncoder().encode("SECOND02"), second);
  view.setUint32(second + 8, secondPayload.length, true);
  bytes.set(secondPayload, second + 12);

  const pack = indexMt7TexturePack(bytes);
  assert.deepEqual(pack.entries.get("4649525354303031"), {
    textureIdHex: "4649525354303031",
    offset: 12,
    length: 4,
  });
  assert.deepEqual(pack.entries.get("5345434f4e443032"), {
    textureIdHex: "5345434f4e443032",
    offset: second + 12,
    length: 2,
  });
  assert.deepEqual(
    pack.ordered.map((entry) => entry.textureIdHex),
    ["4649525354303031", "5345434f4e443032"],
  );

  const resolved = resolveMt7TextureEntry(
    { textures: [{ textureIdHex: "5345434f4e443032" }] },
    pack,
    new Map(),
    0,
  );
  assert.equal(resolved.packed.textureIdHex, "5345434f4e443032");
  assert.notEqual(resolved.packed, pack.ordered[0]);
});

test("builds Babylon meshes from supported MT7 batches", () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const roots = new Mt7Loader(scene).load(fixture(), null, {
    sourceFilename: "fixture.MT7",
  });
  const meshes = roots[0].getChildMeshes();
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].getTotalVertices(), 3);
  assert.equal(meshes[0].getTotalIndices(), 3);
  assert.deepEqual(
    meshes[0].getVerticesData(BABYLON.VertexBuffer.UVKind),
    [0, 0, 1, 0, 0, 1],
  );
  assert.deepEqual(
    meshes[0].getVerticesData(BABYLON.VertexBuffer.PositionKind),
    [0, 0, 0, -1, 0, 0, 0, 1, 0],
  );
  assert.deepEqual(meshes[0].getIndices(), [0, 2, 1]);
  roots[0].dispose();
  scene.dispose();
  engine.dispose();
});

test("map normals remain authored while no-cull characters retain back-face lighting", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const bytes = fixture();
  new DataView(bytes.buffer).setUint32(0x50 + 36, 0, true);
  for (const [assetKind, twoSided] of [["MAPM", false], ["CHRM", true]]) {
    const root = new Mt7Loader(scene).load(bytes, null, { assetKind })[0];
    const mesh = root.getChildMeshes()[0];
    assert.equal(mesh.material.twoSidedLighting, twoSided);
    assert.equal(mesh.material.backFaceCulling, false);
    assert.deepEqual(mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
    root.dispose();
  }
  scene.dispose();
  engine.dispose();
});

test("MT7 character rigs give both sides of a seam identical GPU influences", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const loader = new Mt7Loader(scene, { characterRigSeamMode: "weld" });
  const root = new BABYLON.Mesh("character", scene);
  const leftNode = new BABYLON.TransformNode("left-node", scene);
  const rightNode = new BABYLON.TransformNode("right-node", scene);
  leftNode.parent = root;
  rightNode.parent = root;
  rightNode.position.x = 2;
  const left = new BABYLON.Mesh("left", scene);
  const right = new BABYLON.Mesh("right", scene);
  left.parent = leftNode;
  right.parent = rightNode;
  for (const [mesh, positions] of [
    [left, [1, 0, 0, 0, 0, 0, 0, 1, 0]],
    [right, [-1, 0, 0, 0, 0, 0, 0, 1, 0]],
  ]) {
    mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    mesh.setVerticesData(
      BABYLON.VertexBuffer.NormalKind,
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
    );
    mesh.setIndices([0, 1, 2]);
  }
  root._mt7Nodes = [
    {
      sourceNode: { offset: 0x10, parentOffset: 0 },
      transform: leftNode,
    },
    {
      sourceNode: { offset: 0x20, parentOffset: 0x10 },
      transform: rightNode,
    },
  ];

  const rig = loader.createCharacterGpuRig(root);

  assert.equal(root._mt7CharacterRigSeamGroups.length, 1);
  const leftIndices = left.getVerticesData(
    BABYLON.VertexBuffer.MatricesIndicesKind,
  );
  const rightIndices = right.getVerticesData(
    BABYLON.VertexBuffer.MatricesIndicesKind,
  );
  const leftWeights = left.getVerticesData(
    BABYLON.VertexBuffer.MatricesWeightsKind,
  );
  const rightWeights = right.getVerticesData(
    BABYLON.VertexBuffer.MatricesWeightsKind,
  );
  assert.deepEqual(
    Array.from(leftIndices.slice(0, 2)),
    Array.from(rightIndices.slice(0, 2)),
  );
  assert.deepEqual(Array.from(leftWeights.slice(0, 4)), [0.5, 0.5, 0, 0]);
  assert.deepEqual(Array.from(rightWeights.slice(0, 4)), [0.5, 0.5, 0, 0]);
  assert.deepEqual(Array.from(leftWeights.slice(4, 8)), [1, 0, 0, 0]);
  assert.deepEqual(
    left.getVerticesData(BABYLON.VertexBuffer.PositionKind).slice(0, 3),
    [1, 0, 0],
  );
  assert.deepEqual(
    right.getVerticesData(BABYLON.VertexBuffer.PositionKind).slice(0, 3),
    [1, 0, 0],
  );

  const [merged] = loader.mergeCharacterGpuRigMeshes(root);
  assert.equal(root.metadata.characterMeshCountBeforeMerge, 2);
  assert.equal(root.metadata.characterMeshCountAfterMerge, 1);
  assert.equal(merged.skeleton, rig.skeleton);
  assert.equal(merged.numBoneInfluencers, 2);
  assert.deepEqual(
    Array.from(merged.getVerticesData(
      BABYLON.VertexBuffer.MatricesWeightsKind,
    ).slice(0, 4)),
    [0.5, 0.5, 0, 0],
  );

  rightNode.position.x = 4;
  loader.updateCharacterGpuRig(root);
  assert.equal(rig.boneByNodeOffset.get(0x20)._matrix.m[12], 4);
  engine.dispose();
});

test("uploads decoded MT7 packed colors as Babylon vertex colors", () => {
  const bytes = fixture();
  const view = new DataView(bytes.buffer);
  const material = 0x50 + 24;
  const firstVertex = 0x50 + 112;
  view.setUint32(material, 0x8000009c, true);
  for (let index = 0; index < 3; index += 1) {
    const vertex = firstVertex + index * 32;
    view.setUint32(vertex + 12, 0x00007f00, true);
    view.setUint32(vertex + 16, 0xffb2b2b2, true);
    view.setUint32(vertex + 20, 0, true);
  }

  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const root = new Mt7Loader(scene).load(bytes)[0];
  const mesh = root.getChildMeshes()[0];
  assert.deepEqual(
    mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind),
    [0, 1, 0, 0, 1, 0, 0, 1, 0],
  );
  assert.deepEqual(
    mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind),
    Array(3).fill([178 / 255, 178 / 255, 178 / 255, 1]).flat(),
  );
  assert.equal(mesh.useVertexColors, true);
  root.dispose();
  scene.dispose();
  engine.dispose();
});

test("hides runtime-textured groups without hiding ordinary groups in the same model", () => {
  const bytes = twoGroupFixture();
  const view = new DataView(bytes.buffer);
  const material = 0x50 + 24;
  view.setUint32(material, 0x800000ad, true);
  view.setUint32(material + 8, 0x20080440, true);
  view.setUint32(material + 12, 0x04000000, true);
  view.setUint32(material + 32, 0xffffffff, true);

  const model = parseMt7(bytes);
  const groups = model.nodes[0].mesh.materialGroups;
  const group = groups[0];
  assert.equal(group.textureSource, "runtime-vram");
  assert.deepEqual(group.runtimeTexture, {
    vramAddress: 0,
    width: 8,
    height: 8,
    nonTwiddled: true,
  });
  assert.equal(groups[1].textureSource, "model-table");
  assert.equal(groups[1].runtimeTexture, null);
  assert.equal(model.runtimeTextureGroupCount, 1);
  assert.equal(model.auxiliaryGeometry, null);

  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const roots = new Mt7Loader(scene).load(bytes, null, {
    sourceFilename: "runtime-auxiliary.MT7",
  });
  assert.equal(roots[0].getChildMeshes().length, 1);
  assert.equal(roots[0].metadata.hiddenRuntimeTextureGroupCount, 1);
  assert.equal(roots[0].metadata.auxiliaryGeometry, null);
  roots[0].dispose();
  scene.dispose();
  engine.dispose();
});

test("decodes Dreamcast TSP sampler and polygon-list material state", () => {
  assert.deepEqual(mt7SamplerState(0x2009a45b), {
    width: 64,
    height: 64,
    filterMode: 1,
    addressU: "clamp",
    addressV: "clamp",
    ignoreTextureAlpha: true,
    useVertexAlpha: false,
    destinationBlend: 0,
    sourceBlend: 1,
  });
  assert.equal(
    mt7MaterialState(2 << 24, (4 << 29) | (5 << 26)).transparency,
    "blend",
  );
  assert.equal(mt7MaterialState(0, 0, 0x83000000).cullMode, 0);
  assert.equal(mt7MaterialState(4 << 24, 0).transparency, "alphatest");
  assert.deepEqual(mt7TextureCoordinates(0.25, 0.75, 0x03), [0.75, 0.25]);
  assert.deepEqual(mt7TextureCoordinates(0.25, 0.75, 0x0d), [0.25, 0.75]);
  assert.deepEqual(
    mt7TextureAddressModes({ addressU: "clamp", addressV: "mirror" }, 0x03),
    { u: "mirror", v: "clamp" },
  );
  assert.deepEqual(
    mt7TextureAddressModes({ addressU: "clamp", addressV: "mirror" }, 0x0d),
    { u: "clamp", v: "mirror" },
  );
});

test("composes fixed-turn node rotations with Shenmue's recovered XYZ rule", () => {
  assert.deepEqual(mt7BrowserVector([5, 6, 7]), [-5, 6, 7]);
  const quaternion = mt7RotationQuaternion([
    0.3 * 65536 / (Math.PI * 2),
    0.5 * 65536 / (Math.PI * 2),
    0.7 * 65536 / (Math.PI * 2),
  ]);
  const matrix = BABYLON.Matrix.Compose(
    new BABYLON.Vector3(2, 3, 4),
    quaternion,
    new BABYLON.Vector3(5, 6, 7),
  ).asArray();
  const expected = [
    1.342424, -1.130708, 0.958851,
    1.521246, 2.465863, 0.77803,
    -2.162747, 0.276134, 3.353547,
  ];
  const actual = [
    ...matrix.slice(0, 3),
    ...matrix.slice(4, 7),
    ...matrix.slice(8, 11),
  ];
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 1e-5);
  });
});
