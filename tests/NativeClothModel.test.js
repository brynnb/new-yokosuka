import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  discoverNativeClothGroups,
  NATIVE_CLOTH_CONTROL_TO_RENDER_NODE_TYPE,
  signedMt5NodeType,
} from "../play/characters/NativeClothModel.js";
import {
  NATIVE_CLOTH_MODEL_METADATA,
} from "../play/data/native-cloth-models.web.js";

function modelBuffer(filename) {
  const bytes = fs.readFileSync(`play/assets/characters/${filename}`);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

async function loadModel(scene, filename) {
  const [root] = await new Mt5Loader(scene, {
    characterRigMode: "gpu",
  }).load(modelBuffer(filename), null, { sourceFilename: filename });
  return root;
}

test("native cloth uses the executable's complete control/output mapping", () => {
  assert.deepEqual(NATIVE_CLOTH_CONTROL_TO_RENDER_NODE_TYPE, {
    "-78": 0x95,
    "-77": 0x94,
    "-76": 0x93,
    "-75": 0x92,
    "-74": 0x59,
    "-73": 0x58,
    "-72": 0x57,
    "-71": 0x56,
    "-70": 0x5a,
  });
  assert.equal(signedMt5NodeType({ flag: 0xffb9 }), -71);
  assert.equal(signedMt5NodeType({ flag: 0x56 }), 0x56);
});

test("Lan Di and Ine-san expose authored cloth lattices without actor rules", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 1, renderHeight: 1 });
  const scene = new BABYLON.Scene(engine);
  try {
    const lanDi = discoverNativeClothGroups(
      await loadModel(scene, "KOK_M.CHRM"),
    );
    assert.deepEqual(
      lanDi.map(group => ({
        controlType: group.controlType,
        renderType: group.renderType,
        vertexCount: group.vertexCount,
        hasRenderSurface: group.hasRenderSurface,
      })),
      [
        {
          controlType: -71,
          renderType: 0x56,
          vertexCount: 49,
          hasRenderSurface: true,
        },
        {
          controlType: -72,
          renderType: 0x57,
          vertexCount: 49,
          hasRenderSurface: true,
        },
      ],
    );

    const ine = discoverNativeClothGroups(
      await loadModel(scene, "INE_M.CHRM"),
    );
    assert.deepEqual(
      ine.map(group => ({
        controlType: group.controlType,
        renderType: group.renderType,
        vertexCount: group.vertexCount,
      })),
      [{ controlType: -70, renderType: 0x5a, vertexCount: 70 }],
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("generated native cloth inventory preserves whole-cast coverage", () => {
  const inventory = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-native-cloth-models.json",
    "utf8",
  ));
  assert.equal(
    inventory.schema,
    "new-yokosuka-shenmue1-native-cloth-model-inventory-v2",
  );
  assert.deepEqual(inventory.summary, {
    characterModelCount: 241,
    clothModelCount: 112,
    clothGroupCount: 147,
    renderedGroupCount: 145,
    controlOnlyGroupCount: 2,
    matchingRestPositionGroupCount: 122,
    distinctRestPositionGroupCount: 23,
    groupCountByControlType: {
      "-74": 31,
      "-73": 31,
      "-72": 2,
      "-71": 17,
      "-70": 66,
    },
  });
  assert.deepEqual(
    inventory.models
      .flatMap(model => model.groups
        .filter(group => !group.hasRenderSurface)
        .map(group => `${model.modelFile}:${group.controlType}`)),
    ["HOS_L.CHRM:-70", "KOT_L.CHRM:-70"],
  );
  const lanDi = inventory.models.find(model => model.modelCode === "KOK_M");
  const ine = inventory.models.find(model => model.modelCode === "INE_M");
  assert.equal(
    lanDi.groups.every(
      group => group.renderRestPositionsMatchControl === true,
    ),
    true,
  );
  assert.equal(ine.groups[0].renderRestPositionsMatchControl, true);
  assert.equal(
    inventory.models
      .flatMap(model => model.groups)
      .filter(group => group.renderRestPositionsMatchControl === false)
      .length,
    23,
  );
  const generatedGroups = Object.values(NATIVE_CLOTH_MODEL_METADATA).flat();
  // The refreshed bundle also contains NAT_L: two sleeves and one skirt.
  assert.deepEqual(NATIVE_CLOTH_MODEL_METADATA.NAT_L.map(group => group.controlType),
    [-73, -74, -70]);
  assert.equal(Object.keys(NATIVE_CLOTH_MODEL_METADATA).length, 112);
  assert.equal(generatedGroups.length, 147);
  // Native -71..-74 panels are open. The old greatest-X traversal jumped
  // across curved right panels and falsely classified all 31 as closed.
  assert.equal(generatedGroups.filter(group => group.closedColumns).length, 66);
  for (const group of generatedGroups) {
    if ([-71, -72, -73, -74].includes(group.controlType)) {
      assert.equal(group.closedColumns, false, `open native panel ${group.controlType}`);
    }
    assert.equal(
      group.rowCount * group.columnCount,
      group.vertexCount,
    );
    assert.equal(group.sourceVertexOrder.length, group.vertexCount);
    assert.equal(group.anchorBindings.length, group.vertexCount);
    assert.equal(group.anchorSelectors.length, group.rowCount);
    assert.equal(
      group.latticeToRenderVertexMap?.length ?? null,
      group.hasRenderSurface ? group.vertexCount : null,
    );
  }
});
