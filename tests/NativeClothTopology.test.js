import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  discoverNativeClothGroups,
} from "../play/characters/NativeClothModel.js";
import {
  nativeClothCharacterProfile,
} from "../play/characters/NativeClothProfiles.js";
import {
  buildNativeClothTopology,
} from "../play/characters/NativeClothTopology.js";

const runtimeEvidence = JSON.parse(fs.readFileSync(
  "tools/evidence/shenmue1-native-cloth-runtime.json",
  "utf8",
));

function modelBytes(filename) {
  return fs.readFileSync(`play/assets/characters/${filename}`);
}

function arrayBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function nodePositions(bytes, node) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + node.model.vertexAddr,
    node.model.nbVertex * 24,
  );
  return Array.from({ length: node.model.nbVertex }, (_, index) => [
    view.getFloat32(index * 24, true),
    view.getFloat32(index * 24 + 4, true),
    view.getFloat32(index * 24 + 8, true),
  ]);
}

async function validateCapturedModel(engine, filename, modelCode) {
  const bytes = modelBytes(filename);
  const scene = new BABYLON.Scene(engine);
  try {
    const [root] = await new Mt5Loader(scene, {
      characterRigMode: "gpu",
    }).load(arrayBuffer(bytes), null, { sourceFilename: filename });
    const capturedModel = runtimeEvidence.captures.find(
      capture => capture.modelCode === modelCode,
    );
    const profile = nativeClothCharacterProfile(modelCode);
    for (const group of discoverNativeClothGroups(root)) {
      const captured = capturedModel.groups.find(
        candidate => candidate.controlType === group.controlType,
      );
      const topology = buildNativeClothTopology({
        controlPositions: nodePositions(bytes, group.controlNode),
        renderPositions: group.renderNode
          ? nodePositions(bytes, group.renderNode)
          : null,
        rawControlBytes: profile.rawControlBytes,
        controlType: group.controlType,
      });
      assert.equal(topology.rowCount, captured.lattice.rows);
      assert.equal(topology.columnCount, captured.lattice.columns);
      assert.deepEqual(
        topology.sourceVertexOrder,
        captured.lattice.sourceVertexOrder,
      );
      assert.deepEqual(topology.anchorSelectors, captured.anchorSelectors);
      assert.deepEqual(topology.anchorBindings, captured.anchorBindings);
      assert.deepEqual(
        topology.latticeToRenderVertexMap,
        captured.renderPair.latticeToRenderVertexMap,
      );
      assert.equal(topology.collisionMask, captured.profile.collisionMask);
      for (const [index, constraint] of topology.constraints.entries()) {
        const expected = captured.constraints[index];
        assert.equal(constraint.sourceVertexIndex, expected.sourceVertexIndex);
        assert.equal(constraint.anchorBinding, expected.anchorBinding);
        for (const name of [
          "rowPrevious",
          "rowNext",
          "columnPrevious",
          "columnNext",
        ]) {
          assert.equal(
            constraint.neighbors[name].sourceVertexIndex,
            expected.neighbors[name].sourceVertexIndex,
          );
          assert.ok(
            Math.abs(
              constraint.neighbors[name].restLength
              - expected.neighbors[name].restLength
            ) < 5e-6,
            `${modelCode} ${group.controlType} ${index} ${name}`,
          );
        }
      }
    }
  } finally {
    scene.dispose();
  }
}

test("closed skirt rows align their cyclic columns despite a different greatest-X seed", () => {
  // The two right-hand corners are almost tied. Selecting a row's first
  // vertex independently changes the hem's phase, not its authored shape.
  const ring = [[0.15, 0, 0.1], [0.15, 0, -0.1], [0, 0, -0.15],
    [-0.15, 0, -0.1], [-0.15, 0, 0.1], [0, 0, 0.15]];
  const controlPositions = [...ring, ...ring.map(([x, , z], index) => [
    x + (index === 1 ? 0.000001 : 0), -0.2, z,
  ])];
  const topology = buildNativeClothTopology({
    controlPositions, renderPositions: controlPositions,
    rawControlBytes: [0, 0xfe, 1, 0, 0, 0, 0, 0], controlType: -0x46,
  });
  for (let index = 6; index < 12; index += 1) {
    const constraint = topology.constraints[index];
    assert.equal(constraint.neighbors.rowPrevious.sourceVertexIndex,
      constraint.sourceVertexIndex - 6);
    assert.ok(Math.abs(constraint.neighbors.rowPrevious.restLength - 0.2) < 1e-10);
  }
});

test("curved open panels seed their dominant Z extent rather than an interior X point", () => {
  const row = [[0.073, 0, 0.147], [0.166, 0, 0.106], [0.225, 0, 0],
    [0.194, 0, -0.08], [0.099, 0, -0.135], [0, 0, -0.145]];
  const topology = buildNativeClothTopology({
    controlPositions: [...row, ...row.map(([x, , z]) => [x, -0.15, z])],
    rawControlBytes: [2, 3, 2, 0, 0, 1, 0, 0], controlType: -74,
  });
  assert.deepEqual(topology.sourceVertexOrder, Array.from({ length: 12 }, (_, i) => i));
  assert.equal(topology.closedColumns, false, "native open panels do not wrap their end columns");
  assert.equal(topology.constraints[0].neighbors.columnPrevious.sourceVertexIndex, -1);
  assert.equal(topology.constraints[5].neighbors.columnNext.sourceVertexIndex, -1);
});

test("Megumi's authored hem stays in the same columns as her upper skirt", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const bytes = modelBytes("SIA_L.CHRM");
    const [root] = await new Mt5Loader(scene, { characterRigMode: "gpu" })
      .load(arrayBuffer(bytes), null, { sourceFilename: "SIA_L.CHRM" });
    const group = discoverNativeClothGroups(root)[0];
    const positions = nodePositions(bytes, group.controlNode);
    const topology = buildNativeClothTopology({
      controlPositions: positions,
      rawControlBytes: nativeClothCharacterProfile("SIA_L").rawControlBytes,
      controlType: group.controlType,
    });
    for (const constraint of topology.constraints.slice(18)) {
      const point = positions[constraint.sourceVertexIndex];
      const parent = positions[constraint.neighbors.rowPrevious.sourceVertexIndex];
      // CHRM's last two rings differ almost exclusively in height. None of
      // their row links should traverse a horizontal panel edge.
      assert.ok(Math.hypot(point[0] - parent[0], point[2] - parent[2]) < 0.01);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("generated topology reproduces all four captured native CLTH models", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  try {
    await validateCapturedModel(engine, "KOK_M.CHRM", "KOK");
    await validateCapturedModel(engine, "INE_M.CHRM", "INE");
    await validateCapturedModel(engine, "HPD_L.CHRM", "HPD");
    await validateCapturedModel(engine, "HPX_L.CHRM", "HPX");
  } finally {
    engine.dispose();
  }
});

test("runtime evidence validates the final native surface boundary", () => {
  assert.equal(
    runtimeEvidence.schema,
    "new-yokosuka-shenmue1-native-cloth-runtime-evidence-v1",
  );
  assert.deepEqual(
    runtimeEvidence.nativeUpdateOrder.map(stage => stage.address),
    [
      "0x0c0aeca4",
      "0x0c0af35e",
      "0x0c0b0512",
      "0x0c0aede8",
      "0x0c0b11e4",
    ],
  );
  assert.deepEqual(
    runtimeEvidence.captures.map(capture => [
      capture.modelCode,
      capture.sampleCount,
      capture.groups.map(group => [
        group.controlType,
        group.lattice.rows,
        group.lattice.columns,
      ]),
    ]),
    [
      ["KOK", 12, [[-72, 7, 7], [-71, 7, 7]]],
      ["INE", 6, [[-70, 7, 10]]],
      ["HPD", 108, [[-74, 2, 4], [-73, 2, 4], [-70, 4, 7]]],
      ["HPX", 15, [[-70, 4, 6]]],
    ],
  );
  for (const capture of runtimeEvidence.captures) {
    for (const group of capture.groups) {
      assert.ok(
        group.surfaceAuxiliaryValidation.minimumDirectionDot > 0.99999,
      );
      assert.ok(group.surfaceAuxiliaryValidation.minimumLength > 0.99999);
      assert.ok(group.surfaceAuxiliaryValidation.maximumLength < 1.00001);
      if (group.closedRingSpacingState) {
        assert.equal(group.closedRingSpacingState.maximumBodyRadiusScale, 2);
        assert.deepEqual(
          group.closedRingSpacingState.constraintPassDisableWordValues,
          [0],
        );
      }
    }
  }
});
