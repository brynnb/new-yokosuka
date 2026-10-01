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
import op02Manifest from "../play/assets/introduction/op02/manifest.json" with { type: "json" };
import {
  createNativeAseqHandPresentation,
} from "../play/events/NativeAseqHandPresentation.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { nativeHandAttachmentMatrix } from "../src/NativeHandRig.js";

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

function assertHandSeamsConnected(activeSide, label) {
  let checked = 0;
  for (const [mesh, { groups }] of activeSide.bodySurface.seamBindings) {
    mesh.skeleton?.prepare(true);
    const detailed = mesh.getPositionData(true, true);
    for (const [bodyMesh, pairs] of groups) {
      bodyMesh.skeleton?.prepare(true);
      const body = bodyMesh.getPositionData(true, true);
      for (const { detailedIndex, bodyIndex } of pairs) {
        const actual = BABYLON.Vector3.TransformCoordinates(
          BABYLON.Vector3.FromArray(detailed, detailedIndex * 3), mesh.computeWorldMatrix(true));
        const expected = BABYLON.Vector3.TransformCoordinates(
          BABYLON.Vector3.FromArray(body, bodyIndex * 3), bodyMesh.computeWorldMatrix(true));
        assert.ok(BABYLON.Vector3.Distance(actual, expected) < 1e-5, `${label} authored seam ${detailedIndex}`);
        checked++;
      }
    }
  }
  assert.equal(checked, activeSide.bodySurface.boundExternalParentVertexCount);
}

test("body-only actors animate MHND without loading or replacing detailed meshes", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, { characterRigMode: "gpu", mirrorCharacterX: true });
    const [root] = await loader.load(arrayBuffer(BODY_FIXTURES.FUKU), null);
    loader.applyCharacterRigWorldMatrices(root, null);
    const definition = { mode: "body-only", bodyModelCode: "FUK_M", bodyHandRenderKeys: { left: -66, right: -65 } };
    const hands = createNativeAseqHandPresentation({ scene,
      actors: { activeActor: () => ({ model: { renderRoot: root, loader, modelCode: "FUK_M" } }) },
      definitions: { FUKU: definition }, loadAsset: () => { throw new Error("body hands must not load assets"); },
    });
    const meshes = root.getChildMeshes();
    const indices = meshes.map(mesh => Array.from(mesh.getIndices()));
    await hands.prepare({ actors: ["FUKU"] });
    for (let replay = 0; replay < 2; replay++) {
      const owner = {};
      assert.equal(hands.begin(owner, ["FUKU"]), true);
      assert.equal(hands.play(owner, { name: "body-hand-pose", actorTag: "FUKU",
        channel: 2, targetIndex: 8, durationNativeTicks: 16 }), true);
      for (let frame = 0; frame < 10; frame++) assert.equal(hands.apply(owner), true);
      const active = hands.active.hands.get("FUKU");
      assert.ok(active.sides.left.bodyPose.current.some(word => word !== 0));
      assert.ok(active.sides.right.bodyPose.current.some(word => word !== 0));
      assert.equal(active.sides.left.detailedActive, false);
      assert.equal(active.sides.right.side.root, null);
      assert.throws(() => hands.play(owner, { name: "hand-pose", actorTag: "FUKU", side: "left",
        durationNativeTicks: 1, vectors: op00Manifest.nativeHandPoseTables["0x217f4"].vectors }), /detailed HAND assets/);
      assert.equal(hands.end(owner), true);
      assert.equal(hands.reset(), true);
      assert.deepEqual(meshes.map(mesh => Array.from(mesh.getIndices())), indices);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

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
        characterRigSeamMode: "weld",
      });
      const [bodyRoot] = await bodyLoader.load(arrayBuffer(bodyPath), null);
      if (bodyRigMode === "gpu") {
        bodyLoader.mergeCharacterGpuRigMeshes(bodyRoot, {
          preserveRenderKeySubtrees: [-67, -66, -65],
        });
      }
      bodyLoader.applyCharacterRigWorldMatrices(bodyRoot, null);
      const actorRoot = new BABYLON.TransformNode(`actor_${actorTag}`, scene);
      actorRoot.position.set(3, 0.5, -7);
      actorRoot.rotation.y = 0.7;
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
        // The detailed shell's signed references now own the wrist seam.
        // Keeping the former twelve coarse triangles creates a second palm.
        assert.equal(bodyNodes[side].mesh.isEnabled(), true, `${actorTag} ${side}`);
        const activeSide = hands.active.hands.get(actorTag).sides[side];
        assert.ok(activeSide.bodySurface.boundExternalParentVertexCount > 0, `${actorTag} ${side}`);
        assert.ok(activeSide.bodySurface.seamBindings.size > 0, `${actorTag} ${side}`);
        assert.equal(
          activeSide.bodySurface.retainedTriangleCount,
          0,
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
          0,
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

      for (const side of ["left", "right"]) {
        const mesh = entry[side].deformationMeshes[0].mesh;
        const after = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const before = detailedBefore.get(side);
        assert.ok(after.some((value, index) => Math.abs(value - before[index]) > 1e-4),
          `${actorTag} ${side} pose deforms the rendered vertex buffer`);
      }

      // Finger poses are settled; the authored seam must still follow moving
      // forearms, including GPU-welded copies and the baked-body path.
      for (const angle of [0.3, -0.5]) {
        const routes = new Map(["left", "right"].map(side => {
          const parent = bodyRoot._mt5Nodes.find(node => node.addr === bodyNodes[side].parentAddr);
          return [signedRenderKey(parent), Mt5Loader.rowMultiply(
            Mt5Loader.rowRotationX(angle), bodyLoader.sourceWorldMatrixForNode(parent))];
        }));
        actorModel.latestRetargetedRoutes = routes;
        bodyLoader.applyCharacterRigWorldMatrices(bodyRoot, routes);
        assert.equal(hands.apply(owner), true);
        for (const side of ["left", "right"]) {
          assertHandSeamsConnected(hands.active.hands.get(actorTag).sides[side], `${actorTag} ${side} ${angle}`);
        }
      }

      if (actorTag === "AKIR") {
        const left = hands.active.hands.get(actorTag).sides.left;
        assert.equal(hands.play(owner, { name: "hand-component", actorTag, side: "left",
          componentMask: 0x15, rotationRaw: [-8920, 4004, -5643] }), true);
        assert.equal(hands.apply(owner), true);
        assertHandSeamsConnected(left, "wrist rotation retains authored parent seam");
        const corrected = Array.from(left.side.root._mt5CharacterWorldMatrices.get(left.side.primaryNode.addr));
        assert.equal(hands.play(owner, { name: "hand-component", actorTag, side: "left",
          componentMask: 0x2a, rotationRaw: [8920, -4004, 5643] }), true);
        assert.equal(hands.apply(owner), true);
        assert.deepEqual(left.side.componentRotationRaw, [0, 0, 0]);
        assert.notDeepEqual(Array.from(left.side.root._mt5CharacterWorldMatrices.get(left.side.primaryNode.addr)), corrected);
        assertHandSeamsConnected(left, "wrist reset retains authored parent seam");
        assert.equal(hands.play(owner, { name: "body-hand-pose", actorTag,
          channel: 2, targetIndex: 8, durationNativeTicks: 16, releaseDetailed: true }), true);
        for (const side of ["left", "right"]) {
          assert.equal(entry[side].detailedRequested, false);
          assert.equal(entry[side].root.isEnabled(), false);
          for (const [mesh, indices] of originalBodyIndices[side]) {
            assert.deepEqual(Array.from(mesh.getIndices()), indices, "body handoff restores original triangles");
          }
          assert.equal(hands.play(owner, { name: "hand-pose", actorTag, side,
            vectors: op00Manifest.nativeHandPoseTables["0x217f4"].vectors,
            durationNativeTicks: 1 }), true);
          assert.equal(entry[side].root.isEnabled(), true, "detailed hand can be reactivated");
        }
      }

      if (actorTag === "SORY") {
        // Track 5 leaves SORY's right detailed hand in this exact native pose.
        // The next AUTH track must rebind the authored wrist seam without
        // treating the preceding deformed grip as body-owned geometry.
        assert.equal(hands.play(owner, {
          name: "hand-pose",
          actorTag,
          side: "right",
          durationNativeTicks: 1,
          vectors: op00Manifest.nativeHandPoseTables["0x206b0"].vectors,
        }), true);
        assert.equal(hands.apply(owner, { frame: 350 }), true);
      }

      // Detailed HAND rendering consumes MOMT controls 12/18, not the
      // low-detail MHND hand nodes. Those have the same wrist position but
      // can have a different animated rotation (the Dragon Mirror close-up).
      actorModel.latestControllerFamily = { nodes: [{ index: 1, type: 12 }, { index: 3, type: 18 }] };
      actorModel.latestControllerMatrices = [null,
        Mt5Loader.rowMultiply(Mt5Loader.rowRotationZ(0.6), bodyRoot._mt5CharacterWorldMatrices.get(bodyNodes.left.addr)),
        null,
        Mt5Loader.rowMultiply(Mt5Loader.rowRotationX(-0.4), bodyRoot._mt5CharacterWorldMatrices.get(bodyNodes.right.addr))];
      assert.equal(hands.apply(owner), true);
      for (const [side, index] of [["left", 1], ["right", 3]]) {
        assertMatrixNear(entry[side].root._mt5CharacterWorldMatrices.get(entry[side].primaryNode.addr),
          actorModel.latestControllerMatrices[index], `${actorTag} ${side} uses its native wrist controller`);
        assertHandSeamsConnected(hands.active.hands.get(actorTag).sides[side], `${actorTag} ${side} controller wrist seam`);
      }
      const correction = [-8920, 4004, -5643];
      const wristBefore = [...actorModel.latestControllerMatrices[1]];
      hands.play(owner, { name: "hand-component", actorTag, side: "left", componentMask: 0x15, rotationRaw: correction });
      assert.equal(hands.apply(owner), true);
      assertMatrixNear(entry.left.root._mt5CharacterWorldMatrices.get(entry.left.primaryNode.addr),
        nativeHandAttachmentMatrix(wristBefore, correction), `${actorTag} component correction follows native wrist`);
      assert.deepEqual(actorModel.latestControllerMatrices[1], wristBefore, "hand correction must not rotate carried props");
      assertHandSeamsConnected(hands.active.hands.get(actorTag).sides.left, `${actorTag} corrected controller wrist seam`);
      actorModel.latestControllerMatrices[1] = null;
      assert.throws(() => hands.apply(owner), /wrist controller 12 is unavailable/,
        "a missing animated controller must not silently use the low-detail node");
      actorModel.latestControllerMatrices[1] = wristBefore;

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
          0,
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

test("OP02 uses its archive-local Shenhua hands and keeps the wrists connected across cuts", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, { characterRigMode: "gpu", characterRigSeamMode: "weld", mirrorCharacterX: true });
    const [renderRoot] = await loader.load(arrayBuffer(op02Manifest.packageActors.SINF.assetPath));
    loader.mergeCharacterGpuRigMeshes(renderRoot, { preserveRenderKeySubtrees: [-66, -65] });
    loader.applyCharacterRigWorldMatrices(renderRoot, null);
    const actor = { model: { renderRoot, loader, modelCode: "MGR_M" } };
    const hands = createNativeAseqHandPresentation({ scene, actors: { activeActor: () => actor },
      definitions: op02Manifest.handAssets, loadAsset: arrayBuffer });
    await hands.prepare({ actors: ["SINF"] });
    const owner = {};
    hands.begin(owner, ["SINF"]);
    const entry = hands.entries.get("SINF");
    for (const side of ["left", "right"]) {
      assert.equal(entry[side].primaryNode.model.nbVertex, 299);
      assert.equal(entry[side].root.isEnabled(), false, "body hands remain until the native switch");
      const surfaces = entry[side].root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0);
      assert.ok(surfaces.length > 0);
      assert.ok(surfaces.every(mesh => mesh.material?.diffuseTexture), "CHRM textures come from the archive texture pack");
    }
    const activity = op02Manifest.activities.find(activity => activity.slot === 4);
    for (const cue of activity.nativeHandPoseCues) {
      assert.equal(hands.play(owner, { name: "hand-pose", ...cue,
        vectors: op02Manifest.nativeHandPoseTables[cue.poseTableOffset].vectors }), true);
    }
    for (const cue of activity.nativeHandComponentCues) {
      assert.equal(hands.play(owner, { name: "hand-component", ...cue }), true);
    }
    assert.equal(hands.apply(owner), true);
    for (const side of Object.values(hands.active.hands.get("SINF").sides)) {
      assert.equal(side.detailedActive, true);
      assertHandSeamsConnected(side, "Shenhua wrist");
    }
    hands.end(owner);
    const next = {};
    hands.begin(next, ["SINF"]);
    for (const side of Object.values(hands.active.hands.get("SINF").sides)) {
      assert.equal(side.side.root.isEnabled(), true, "last shot retains the authored detailed hand pose");
      assertHandSeamsConnected(side, "Shenhua wrist after cut");
    }
    hands.end(next);
  } finally {
    scene.dispose();
    engine.dispose();
  }
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
