import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import inventory from "../play/assets/introduction/op00/asset-inventory.generated.json" with {
  type: "json",
};
import op00Manifest from "../play/assets/introduction/op00/manifest.json" with {
  type: "json",
};
import {
  createNativeAseqHandPresentation,
} from "../play/events/NativeAseqHandPresentation.js";
import { Mt5Loader } from "../src/Mt5Loader.js";

const BODY_FIXTURES = Object.freeze({
  AKIR: "public/models/S2_YDB1_YKC_M.MT5",
  FUKU: "play/assets/characters/FUK_M.CHRM",
  INE_: "play/assets/characters/INE_M.CHRM",
  IWAO: "play/assets/characters/IWA_M.CHRM",
  SORY: "play/assets/characters/KOK_M.CHRM",
});

function arrayBuffer(filename) {
  const value = readFileSync(filename);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

function signedRenderKey(node) {
  const low16 = node.flag & 0xffff;
  return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

function nodeFor(root, renderKey) {
  return root._mt5Nodes.find(node => (
    signedRenderKey(node) === renderKey && node.model
  ));
}

function subtreeRenderMeshes(root, rootNode) {
  const addresses = new Set([rootNode.addr]);
  let added = true;
  while (added) {
    added = false;
    for (const node of root._mt5Nodes) {
      if (!addresses.has(node.addr) && addresses.has(node.parentAddr)) {
        addresses.add(node.addr);
        added = true;
      }
    }
  }
  return [...new Set(root._mt5Nodes
    .filter(node => addresses.has(node.addr))
    .flatMap(node => node.mesh.getChildMeshes(false))
    .filter(mesh => (
      mesh instanceof BABYLON.Mesh
      && addresses.has(mesh._mt5NodeAddress)
      && mesh.getTotalIndices() > 0
    )))];
}

function assertMatrixNear(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) < 1e-6,
      `${label} matrix value ${index}`,
    );
  }
}

test("OP00 detailed hands replace only the authored low-detail hand nodes", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    for (const [actorTag, bodyPath] of Object.entries(BODY_FIXTURES)) {
      const definition = inventory.handAssets[actorTag];
      const bodyRigMode = actorTag === "AKIR" ? "baked" : "gpu";
      const bodyLoader = new Mt5Loader(scene, {
        backFaceCulling: false,
        mirrorCharacterX: true,
        characterRigMode: bodyRigMode,
      });
      const [bodyRoot] = await bodyLoader.load(arrayBuffer(bodyPath), null);
      if (bodyRigMode === "gpu") {
        bodyLoader.mergeCharacterGpuRigMeshes(bodyRoot, {
          preserveRenderKeySubtrees: [-67, -66, -65],
        });
      }
      bodyLoader.applyCharacterRigWorldMatrices(bodyRoot, null);
      const actorRoot = new BABYLON.TransformNode(`actor_${actorTag}`, scene);
      bodyRoot.parent = actorRoot;
      const actorModel = {
        loader: bodyLoader,
        renderRoot: bodyRoot,
        root: actorRoot,
        modelCode: definition.bodyModelCode,
      };
      const hands = createNativeAseqHandPresentation({
        scene,
        actors: {
          activeActor: value => value === actorTag
            ? { actorCode: actorTag, root: actorRoot, model: actorModel }
            : null,
        },
        definitions: { [actorTag]: definition },
        loadAsset: filename => arrayBuffer(filename),
      });
      await hands.prepare({ actors: [actorTag] });
      const entry = hands.entries.get(actorTag);
      assert.equal(entry.rig.transformNodeCount, 71, actorTag);
      assert.equal(entry.rig.vertexCount, 306, actorTag);

      const bodyNodes = Object.fromEntries(["left", "right"].map(side => [
        side,
        nodeFor(bodyRoot, definition.bodyHandRenderKeys[side]),
      ]));
      const originalBodyIndices = Object.fromEntries(["left", "right"].map(
        side => [
          side,
          new Map(subtreeRenderMeshes(bodyRoot, bodyNodes[side]).map(
            mesh => [mesh, Array.from(mesh.getIndices())],
          )),
        ],
      ));
      for (const side of ["left", "right"]) {
        assert.ok(
          bodyNodes[side].model.nbVertex < 40,
          `${actorTag} ${side} body hand remains the low-detail resource`,
        );
        assert.equal(entry[side].primaryNode.model.nbVertex, 306, `${actorTag} ${side}`);
        assert.equal(bodyNodes[side].mesh.isEnabled(), true, `${actorTag} ${side}`);
        const lowDetailMeshes = subtreeRenderMeshes(bodyRoot, bodyNodes[side]);
        assert.ok(lowDetailMeshes.length > 1, `${actorTag} ${side}`);
        assert.equal(
          lowDetailMeshes.every(mesh => mesh.isEnabled()),
          true,
          `${actorTag} ${side}`,
        );
      }

      const owner = {};
      assert.equal(hands.begin(owner, [actorTag]), true, actorTag);
      for (const side of ["left", "right"]) {
        const activeSide = hands.active.hands.get(actorTag).sides[side];
        assert.equal(activeSide.bodySurface, null, `${actorTag} ${side}`);
        assert.equal(entry[side].root.isEnabled(), false, `${actorTag} ${side}`);
        assert.equal(
          subtreeRenderMeshes(bodyRoot, bodyNodes[side]).every(
            mesh => mesh.getTotalIndices() > 0,
          ),
          true,
          `${actorTag} ${side}`,
        );
      }
      const rightFingerNode = bodyRoot._mt5Nodes.find(node => (
        signedRenderKey(node) === 28
      ));
      const rightFingerBefore = Array.from(
        bodyRoot._mt5CharacterWorldMatrices.get(rightFingerNode.addr),
      );

      assert.equal(hands.play(owner, {
        name: "body-hand-pose",
        actorTag,
        channel: 2,
        targetIndex: 0,
        durationNativeTicks: 16,
      }), true, actorTag);
      for (let frame = 0; frame < 8; frame += 1) {
        assert.equal(hands.apply(owner, { frame }), true, actorTag);
      }
      assert.deepEqual(
        Array.from(entry.bodyPoses.right.current),
        [0, 0, 0, 0, 0x31c7, 0, 0x31c7, 0x31c7, 0, 0x31c7],
        actorTag,
      );
      assert.deepEqual(
        Array.from(entry.bodyPoses.left.current),
        [0, 0, 0, 0, -0x31c7, 0, -0x31c7, -0x31c7, 0, -0x31c7],
        actorTag,
      );
      assert.notDeepEqual(
        Array.from(bodyRoot._mt5CharacterWorldMatrices.get(rightFingerNode.addr)),
        rightFingerBefore,
        `${actorTag} native MHND pose reaches body hand nodes`,
      );

      const detailedBefore = new Map();
      for (const side of ["left", "right"]) {
        const mesh = entry[side].deformationMeshes[0].mesh;
        detailedBefore.set(side, Array.from(
          mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
        ));
        assert.equal(hands.play(owner, {
          name: "hand-pose",
          actorTag,
          side,
          durationNativeTicks: 1,
          vectors: op00Manifest.nativeHandPoseTables["0x217f4"].vectors,
        }), true, `${actorTag} ${side}`);
      }
      assert.equal(hands.apply(owner, { frame: 294 }), true, actorTag);
      for (const side of ["left", "right"]) {
        // Keep the proximal wrist ring from the body hand. Every triangle on
        // the detailed hand's distal side of its authored boundary transfers
        // to the high-detail resource, including all low-detail fingers.
        assert.equal(bodyNodes[side].mesh.isEnabled(), true, `${actorTag} ${side}`);
        const activeSide = hands.active.hands.get(actorTag).sides[side];
        assert.equal(activeSide.bodySurface.limbAxis, 0, `${actorTag} ${side}`);
        assert.ok(
          activeSide.bodySurface.boundary > 0
            && activeSide.bodySurface.boundary < 0.01,
          `${actorTag} ${side}`,
        );
        assert.equal(
          activeSide.bodySurface.retainedTriangleCount,
          12,
          `${actorTag} ${side}`,
        );
        const remainingBodyMeshes = subtreeRenderMeshes(
          bodyRoot,
          bodyNodes[side],
        ).filter(mesh => mesh.getTotalIndices() > 0);
        assert.equal(
          remainingBodyMeshes.every(
            mesh => mesh._mt5NodeAddress === bodyNodes[side].addr,
          ), true,
          `${actorTag} ${side}`,
        );
        assert.equal(
          remainingBodyMeshes.reduce(
            (total, mesh) => total + mesh.getTotalIndices() / 3,
            0,
          ),
          12,
          `${actorTag} ${side}`,
        );
        assert.equal(entry[side].root.isEnabled(), true, `${actorTag} ${side}`);
        assert.equal(entry[side].root.parent, bodyRoot, `${actorTag} ${side}`);
        const bodyMatrix = bodyRoot._mt5CharacterWorldMatrices.get(
          bodyNodes[side].addr,
        );
        const detailedMatrix = entry[side].root._mt5CharacterWorldMatrices.get(
          entry[side].primaryNode.addr,
        );
        assertMatrixNear(detailedMatrix, bodyMatrix, `${actorTag} ${side}`);
        for (const material of new Set(entry[side].root.getChildMeshes(false).map(
          mesh => mesh.material,
        ).filter(Boolean))) {
          assert.equal(material.backFaceCulling, true, `${actorTag} ${side}`);
          assert.equal(
            material.sideOrientation,
            BABYLON.Material.ClockWiseSideOrientation,
            `${actorTag} ${side}`,
          );
        }
      }

      if (actorTag === "AKIR") {
        const mesh = entry.left.deformationMeshes[0].mesh;
        const after = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const before = detailedBefore.get("left");
        assert.ok(after.some((value, index) => Math.abs(value - before[index]) > 1e-4));
      }

      if (actorTag === "SORY") {
        // Track 5 leaves SORY's right detailed hand in this exact native pose.
        // The next AUTH track must derive surface ownership from immutable
        // authored geometry, not from those already-deformed vertices.
        assert.equal(hands.play(owner, {
          name: "hand-pose",
          actorTag,
          side: "right",
          durationNativeTicks: 1,
          vectors: op00Manifest.nativeHandPoseTables["0x206b0"].vectors,
        }), true);
        assert.equal(hands.apply(owner, { frame: 350 }), true);
      }

      assert.equal(hands.end(owner), true, actorTag);
      for (const side of ["left", "right"]) {
        assert.equal(bodyNodes[side].mesh.isEnabled(), true, `${actorTag} ${side}`);
        assert.equal(
          subtreeRenderMeshes(bodyRoot, bodyNodes[side]).every(
            mesh => mesh.isEnabled() && mesh.getTotalIndices() > 0,
          ),
          true,
          `${actorTag} ${side}`,
        );
        for (const [mesh, indices] of originalBodyIndices[side]) {
          assert.deepEqual(
            Array.from(mesh.getIndices()),
            indices,
            `${actorTag} ${side} exact body indices`,
          );
        }
        assert.equal(entry[side].root.isEnabled(), false, `${actorTag} ${side}`);
        assert.equal(entry[side].root.parent, null, `${actorTag} ${side}`);
      }
      if (actorTag === "SORY") {
        const nextOwner = {};
        assert.equal(hands.begin(nextOwner, [actorTag]), true);
        assert.equal(
          hands.active.hands.get(actorTag).sides.right
            .bodySurface.retainedTriangleCount,
          12,
        );
        assert.equal(hands.end(nextOwner), true);
      }
      bodyRoot.dispose(false, true);
      actorRoot.dispose();
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("OP00 Ryo hand selection follows native YKB slot-5 evidence", () => {
  const hand = inventory.handAssets.AKIR;
  assert.equal(hand.handCode, "YKB");
  assert.equal(hand.left.model.sourcePath.endsWith("/YKB_TL.MT5"), true);
  assert.equal(hand.right.model.sourcePath.endsWith("/YKB_TR.MT5"), true);
  assert.equal(hand.rig.sourcePath.endsWith("/YKB_HM.BIN"), true);
});

test("a failed hand pair rolls back both sides and can be retried without orphan meshes", async () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const definition = structuredClone(inventory.handAssets.AKIR);
  const validRightKey = definition.right.rootRenderKey;
  const hands = createNativeAseqHandPresentation({
    scene,
    actors: { activeActor: () => null },
    definitions: { AKIR: definition },
    loadAsset: filename => arrayBuffer(filename),
  });
  try {
    // The bytes are valid; fail validation only after both real model loaders
    // have created scene resources, exercising the successful sibling too.
    definition.right.rootRenderKey = 32767;
    const initialMeshes = scene.meshes.length;
    const initialRoots = scene.transformNodes.length;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(
        hands.prepare({ actors: ["AKIR"] }),
        /AKIR right HAND has an unexpected vertex count/,
      );
      assert.equal(hands.entries.size, 0);
      assert.equal(hands.pending.size, 0);
      assert.equal(scene.meshes.length, initialMeshes);
      assert.equal(scene.transformNodes.length, initialRoots);
    }
    definition.right.rootRenderKey = validRightKey;
    assert.equal(await hands.prepare({ actors: ["AKIR"] }), true);
    const entry = hands.entries.get("AKIR");
    assert.ok(entry.left.root && entry.right.root);
    assert.equal(hands.pending.size, 0);
    const preparedMeshes = scene.meshes.length;
    await hands.prepare({ actors: ["AKIR"] });
    assert.equal(scene.meshes.length, preparedMeshes);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
