import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import inventory from "../play/assets/introduction/op00/asset-inventory.generated.json" with {
  type: "json",
};
import tgma from "../play/assets/hazuki/tgma/manifest.json" with {
  type: "json",
};
import {
  createNativeAseqFacialPresentation,
} from "../play/events/NativeAseqFacialPresentation.js";
import {
  integrateBodyFaceSurface,
  restoreBodyFaceSurface,
} from "../src/FaceSurfaceIntegration.js";
import { Mt5Loader } from "../src/Mt5Loader.js";

const BODY_FACE_FIXTURES = Object.freeze({
  AKIR: Object.freeze({
    path: "public/models/S2_YDB1_YKC_M.MT5",
    removed: 536,
    retained: 148,
    replacesAuthoredDescendant: true,
  }),
  FUKU: Object.freeze({
    path: "play/assets/characters/FUK_M.CHRM",
    removed: 392,
    retained: 0,
    replacesAuthoredDescendant: true,
  }),
  INE_: Object.freeze({
    path: "play/assets/characters/INE_M.CHRM",
    removed: 526,
    retained: 0,
    replacesAuthoredDescendant: false,
  }),
  IWAO: Object.freeze({
    path: "play/assets/characters/IWA_M.CHRM",
    removed: 570,
    retained: 144,
    replacesAuthoredDescendant: false,
  }),
  SORY: Object.freeze({
    path: "play/assets/characters/KOK_M.CHRM",
    removed: 914,
    retained: 172,
    replacesAuthoredDescendant: false,
  }),
});

function arrayBuffer(filename) {
  const value = readFileSync(filename);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

function assertVectorClose(actual, expected, label, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length, label);
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= epsilon,
      `${label} axis ${index}: expected ${expected[index]}, received ${actual[index]}`,
    );
  }
}

function signedRenderKey(node) {
  const low16 = node.flag & 0xffff;
  return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

function subtreeIndexCount(root) {
  return [root, ...(root.getChildMeshes?.(false) || [])].reduce(
    (total, mesh) => total + (mesh.getTotalIndices?.() || 0),
    0,
  );
}

function assertNativeTriangleWinding(root) {
  // Smoothed lighting normals need not point to a triangle's front side,
  // especially at borrowed collar vertices. Test the authored signed strips.
  const orientedKey = corners => [0, 1, 2].map(i => [
    corners[i], corners[(i + 1) % 3], corners[(i + 2) % 3],
  ].join(":")).sort()[0];
  let checked = 0;
  for (const mesh of root.getChildMeshes(false)) {
    const node = root._mt5Nodes.find(node => node.addr === mesh._mt5NodeAddress);
    const indices = mesh.getIndices();
    if (!node?.model || !indices?.length) continue;
    const expected = new Set();
    for (const poly of node.model.polygons) for (const strip of poly.strips) {
      const vertices = strip.map(v => v.externalParentVertexOffset < 0
        ? `parent${v.externalParentVertexOffset}` : v.idx);
      for (let i = 0; i < vertices.length - 2; i++) {
        const [a, b, c] = vertices.slice(i, i + 3);
        expected.add(orientedKey((i + (strip._mt5StripLenRaw < 0 ? 1 : 0)) % 2
          ? [a, c, b] : [a, b, c]));
      }
    }
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      const actual = indices.slice(offset, offset + 3).map(index => (
        mesh._mt5ExternalParentVertexOffsets?.[index] < 0
          ? `parent${mesh._mt5ExternalParentVertexOffsets[index]}`
          : mesh._mt5SourceVertexIndices[index]
      ));
      assert.ok(expected.has(orientedKey(actual)), `${mesh.name} triangle ${offset / 3} retains signed strip winding`);
      checked++;
    }
  }
  assert.ok(checked > 0);
}

test("cutscene faces preserve the native neck while replacing overlapping face surfaces", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    const bodyLoader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      characterRigMode: "gpu",
    });
    const [bodyRoot] = await bodyLoader.load(
      arrayBuffer("public/models/S2_YDB1_YKC_M.MT5"),
      null,
      { sourceFilename: "S2_YDB1_YKC_M.MT5" },
    );
    assert.ok(bodyRoot);
    bodyLoader.mergeCharacterGpuRigMeshes(bodyRoot, {
      preserveRenderKeySubtrees: [-67],
    });
    bodyLoader.applyCharacterRigWorldMatrices(bodyRoot, null);
    const bodyFaceNode = bodyRoot._mt5Nodes.find(
      node => signedRenderKey(node) === -67 && node.model,
    );
    assert.ok(bodyFaceNode);
    assert.ok(bodyFaceNode.mesh.getDescendants(false).some(
      node => node instanceof BABYLON.Mesh && node.getTotalVertices() > 0,
    ));
    const originalBodyIndexCount = subtreeIndexCount(bodyFaceNode.mesh);

    const actorModel = {
      loader: bodyLoader,
      renderRoot: bodyRoot,
      root: new BABYLON.TransformNode("actor", scene),
      modelCode: "YKC_M",
    };
    bodyRoot.parent = actorModel.root;
    const faces = createNativeAseqFacialPresentation({
      scene,
      actors: {
        activeActor: actorTag => actorTag === "AKIR"
          ? { actorCode: "AKIR", root: actorModel.root, model: actorModel }
          : null,
        componentWorldPosition: (actorTag, selector) => (
          actorTag === "IWAO" && selector === -1 ? [-2, 0, -4] : null
        ),
      },
      definitions: { AKIR: inventory.facialAssets.AKIR },
      loadAsset: filename => arrayBuffer(filename),
    });
    await faces.prepare({ actors: ["AKIR"] });
    const faceEntry = faces.entries.get("AKIR");
    assertNativeTriangleWinding(faceEntry.root);
    const faceMaterials = new Set(faceEntry.root.getChildMeshes(false).map(
      mesh => mesh.material,
    ).filter(Boolean));
    assert.ok(faceMaterials.size > 0);
    for (const material of faceMaterials) {
      assert.equal(material.backFaceCulling, true);
      assert.equal(
        material.sideOrientation,
        BABYLON.Material.ClockWiseSideOrientation,
      );
      assert.equal(material.twoSidedLighting, false);
    }
    const primaryMesh = faceEntry.primaryMeshes[0];
    const detailedEyeTextureIds = new Set(faceEntry.eyeNodes.flatMap(node => (
      node.mesh.getChildMeshes(false)
        .filter(mesh => mesh._mt5NodeAddress === node.addr)
        .map(mesh => mesh.metadata?.mt5TextureId)
    )));
    const bodyEyeMesh = bodyFaceNode.mesh.getChildMeshes(false).find(mesh => (
      mesh._mt5NodeAddress === bodyFaceNode.addr
      && detailedEyeTextureIds.has(mesh.metadata?.mt5TextureId)
      && mesh.getTotalIndices() === 42
    ));
    assert.ok(bodyEyeMesh, "AKIR low-detail body eyes must be identifiable");
    const authored = Array.from(primaryMesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));
    const externalParentOffsets = primaryMesh
      ._mt5ExternalParentVertexOffsets;
    assert.ok(externalParentOffsets);
    assert.ok(Array.from(externalParentOffsets).some(offset => offset < 0));
    const owner = {};
    assert.equal(faces.begin(owner, ["AKIR"]), true);
    assert.equal(bodyFaceNode.mesh.isEnabled(), true);
    const integratedBodyIndexCount = subtreeIndexCount(bodyFaceNode.mesh);
    // GPU mesh flattening leaves only the replaced FACE node here. Authored
    // hair descendants are checked through surfaceIntegration below instead.
    assert.equal(integratedBodyIndexCount, 0);
    assert.ok(integratedBodyIndexCount < originalBodyIndexCount);
    const integration = faces.active.faces.get("AKIR").surfaceIntegration;
    assert.ok(integration.removedTriangleCount > 0);
    assert.ok(integration.retainedTriangleCount > 0);
    assert.ok(integration.boundExternalParentVertexCount > 0);
    assert.equal(
      bodyEyeMesh.getTotalIndices(),
      0,
      "detailed AKIR eyes must completely own the low-detail eye surface",
    );
    assert.equal(faceEntry.root.isEnabled(), true);
    assert.equal(faceEntry.root.parent, bodyRoot);
    assertNativeTriangleWinding(faceEntry.root);
    const ryoScalpTriangle = [27 * 3, 27 * 3 + 1, 27 * 3 + 2].map(
      offset => primaryMesh.getIndices()[offset],
    ).map(vertexIndex => {
      const positions = primaryMesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      );
      return positions.slice(vertexIndex * 3, vertexIndex * 3 + 3);
    });
    const ryoScalpMaximumEdge = Math.max(...ryoScalpTriangle.flatMap(
      (first, firstIndex) => ryoScalpTriangle.slice(firstIndex + 1).map(
        second => Math.hypot(...first.map(
          (value, axis) => value - second[axis],
        )),
      ),
    ));
    assert.ok(
      ryoScalpMaximumEdge < 0.08,
      `Ryo's signed scalp seam stretched to ${ryoScalpMaximumEdge}m`,
    );

    assert.equal(faces.apply(owner), true);
    const neutralEyeMatrices = faceEntry.eyeNodes.map(node => (
      [...faceEntry.root._mt5CharacterWorldMatrices.get(node.addr)]
    ));
    const neutral = Array.from(primaryMesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));
    assert.ok(
      neutral.every((value, index) => (
        externalParentOffsets[Math.floor(index / 3)] < 0
        || Math.abs(value - authored[index]) < 0.001
      )),
      "neutral TALK deformation must remain in the loader's baked source space",
    );
    const boundSeam = neutral.filter((value, index) => (
      externalParentOffsets[Math.floor(index / 3)] < 0
    ));
    assert.equal(faces.play(owner, {
      name: "face-gaze",
      actorTag: "AKIR",
      mode: 2,
      durationNativeTicks: 1,
      target: {
        kind: "actor-component",
        actorTag: "IWAO",
        selector: -1,
        associated: false,
        offset: [0, 0, 0],
      },
    }), true);
    assert.equal(faces.play(owner, {
      name: "face-clip",
      actorTag: "AKIR",
      clipGroup: 10,
      selector: 0,
      durationNativeTicks: 1,
    }), true);
    assert.equal(faces.apply(owner, { frame: 1 }), true);
    for (const [index, node] of faceEntry.eyeNodes.entries()) {
      assert.notDeepEqual(
        faceEntry.root._mt5CharacterWorldMatrices.get(node.addr),
        neutralEyeMatrices[index],
        `detailed eye ${index} must receive its authored gaze rotation`,
      );
    }
    const authoredExpression = Array.from(primaryMesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));
    assert.notDeepEqual(authoredExpression, neutral);
    assert.deepEqual(
      authoredExpression.filter((value, index) => (
        externalParentOffsets[Math.floor(index / 3)] < 0
      )),
      boundSeam,
      "upper-face animation must not deform the body-owned seam",
    );
    const voiceCue = { positionSeconds: 0, command: {
      name: "voice",
      actorTag: "AKIR",
      audio: {
        speakerId: "AKIR",
        lipSync: {
          format: "shenmue-srf-mouth-cues-v1",
          tickRate: 60,
          cues: [
            { shape: 5, durationTicks: 12 },
            { shape: 0, durationTicks: 8 },
          ],
        },
      },
    } };
    for (let frame = 2; frame <= 3; frame += 1) {
      voiceCue.positionSeconds = (frame - 1) / 30;
      assert.equal(faces.apply(owner, { frame, voiceCues: new Map([["AKIR", voiceCue]]) }), true);
    }
    const speaking = Array.from(primaryMesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));
    assert.notDeepEqual(speaking, neutral);
    assert.deepEqual(
      speaking.filter((value, index) => (
        externalParentOffsets[Math.floor(index / 3)] < 0
      )),
      boundSeam,
      "lip sync must not deform the body-owned seam",
    );

    assert.equal(faces.end(owner), true);
    assert.equal(bodyFaceNode.mesh.isEnabled(), true);
    assert.equal(subtreeIndexCount(bodyFaceNode.mesh), originalBodyIndexCount);
    assert.equal(faceEntry.root.isEnabled(), false);
    assert.equal(faceEntry.root.parent, null);

    const nextOwner = {};
    assert.equal(faces.begin(nextOwner, ["AKIR"]), true);
    assert.equal(faces.apply(nextOwner), true);
    assert.deepEqual(
      Array.from(primaryMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
      speaking,
      "FACE pose state must survive adjacent AUTH activity boundaries",
    );
    assert.equal(faces.end(nextOwner), true);
    assert.equal(faces.reset(), true);

    const resetOwner = {};
    assert.equal(faces.begin(resetOwner, ["AKIR"]), true);
    assert.equal(faces.apply(resetOwner), true);
    assert.deepEqual(
      Array.from(primaryMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
      neutral,
      "program reset must restore the native clip-zero face",
    );
    assert.equal(faces.end(resetOwner), true);

    const offCameraOwner = {};
    assert.equal(faces.begin(offCameraOwner, []), true);
    assert.equal(faces.play(offCameraOwner, {
      name: "face-clip",
      actorTag: "AKIR",
      clipGroup: 10,
      selector: 0,
      durationNativeTicks: 1,
    }), true);
    assert.equal(faces.apply(offCameraOwner, { frame: 1 }), true);
    assert.equal(faces.end(offCameraOwner), true);

    const returnOwner = {};
    assert.equal(faces.begin(returnOwner, ["AKIR"]), true);
    assert.equal(faces.apply(returnOwner), true);
    assert.notDeepEqual(
      Array.from(primaryMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
      neutral,
      "off-camera FACE cues must be visible when an actor returns",
    );
    assert.equal(faces.end(returnOwner), true);

    const programOwner = {};
    faces.reset();
    assert.equal(faces.beginProgram(programOwner, ["AKIR"]), true);
    faces.begin(owner, ["AKIR"]);
    voiceCue.positionSeconds = 2 / 30;
    const cues = new Map([["AKIR", voiceCue]]);
    faces.apply(owner, { frame: 1, voiceCues: cues });
    const activeFace = faces.active.faces.get("AKIR");
    assert.equal(activeFace.voiceFrame, 2);
    faces.apply(owner, { frame: 2, voiceCues: cues });
    assert.equal(activeFace.voiceFrame, 2, "buffering audio must hold mouth time while shot time advances");
    faces.end(owner);
    faces.begin(offCameraOwner, []);
    faces.end(offCameraOwner);
    faces.begin(nextOwner, ["AKIR"]);
    voiceCue.positionSeconds = 9 / 30;
    faces.apply(nextOwner, { frame: 0, voiceCues: cues });
    assert.equal(faces.active.faces.get("AKIR"), activeFace);
    assert.equal(activeFace.voiceFrame, 9, "returning from offscreen must catch up to audio, not restart at shot zero");
    faces.apply(nextOwner, { frame: 1, voiceCues: new Map() });
    assert.equal(activeFace.voiceCue, null);
    faces.end(nextOwner);
    assert.equal(faces.endProgram(programOwner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("detailed FACE seams follow the production body's welded GPU deformation across poses and leases", async () => {
  const engine = new BABYLON.NullEngine();
  try {
    for (const [actorTag, fixture] of [
      ...Object.entries(BODY_FACE_FIXTURES),
      ["IWAO", { path: "play/assets/hazuki/hihy/IWA_M.CHRM", parentOnlySeam: 38 }],
    ]) {
      const scene = new BABYLON.Scene(engine);
      try {
        const definition = inventory.facialAssets[actorTag];
        const loader = new Mt5Loader(scene, {
          mirrorCharacterX: true, characterRigMode: "gpu", characterRigSeamMode: "weld",
        });
        const [renderRoot] = await loader.load(arrayBuffer(fixture.path), null);
        loader.mergeCharacterGpuRigMeshes(renderRoot, { preserveRenderKeySubtrees: [-67] });
        const bodyNode = renderRoot._mt5Nodes.find(node => signedRenderKey(node) === -67 && node.model);
        const parent = renderRoot._mt5Nodes.find(node => node.addr === bodyNode.parentAddr);
        if (fixture.parentOnlySeam !== undefined) {
          assert.ok(!bodyNode.mesh.getChildMeshes(false).some(mesh => (
            mesh._mt5NodeAddress === bodyNode.addr
            && mesh._mt5SourceVertexIndices?.includes(fixture.parentOnlySeam)
          )), "archive body does not duplicate this parent seam on its coarse FACE");
        }
        const root = new BABYLON.TransformNode("actor", scene);
        root.position.set(3, 0.5, -7);
        root.rotation.y = 0.7;
        renderRoot.parent = root;
        const faces = createNativeAseqFacialPresentation({
          scene,
          actors: {
            activeActor: () => ({ model: { loader, renderRoot, root, modelCode: definition.bodyModelCode } }),
            componentWorldPosition: () => null,
          },
          definitions: { [actorTag]: definition },
          loadAsset: filename => arrayBuffer(filename),
        });
        await faces.prepare({ actors: [actorTag] });
        const entry = faces.entries.get(actorTag);
        const originalIndices = new Map(renderRoot.getChildMeshes(false).map(mesh => [mesh, Array.from(mesh.getIndices())]));
        for (let lease = 0; lease < 2; lease += 1) {
          const owner = {};
          assert.equal(faces.begin(owner, [actorTag]), true);
          const integration = faces.active.faces.get(actorTag).surfaceIntegration;
          for (const [frame, angle] of [0.3, -0.5, 0].entries()) {
            const headMatrix = Mt5Loader.rowMultiply(
              Mt5Loader.rowRotationX(angle), loader.sourceWorldMatrixForNode(bodyNode),
            );
            const parentMatrix = Mt5Loader.rowMultiply(
              Mt5Loader.rowRotationZ(angle / 2), loader.sourceWorldMatrixForNode(parent),
            );
            loader.applyCharacterRigWorldMatrices(renderRoot, new Map([
              [-67, headMatrix], [signedRenderKey(parent), parentMatrix],
            ]));
            assert.equal(faces.apply(owner, { frame }), true);
            // Rendering prepares the latest pose even if several native ticks
            // ran under one scene render ID. Do not let both sides compare the
            // same stale Babylon skin-matrix cache in this headless check.
            renderRoot._mt5CharacterGpuRig.skeleton.prepare(true);
            entry.root._mt5CharacterGpuRig.skeleton.prepare(true);
            let checked = 0;
            for (const mesh of entry.primaryMeshes) {
              const posed = mesh.getPositionData(true, true);
              const world = mesh.computeWorldMatrix(true);
              for (const [index, relative] of mesh._mt5ExternalParentVertexOffsets?.entries() || []) {
                if (relative >= 0) continue;
                const sourceIndex = parent.model.vertexBase + parent.model.nbVertex + relative;
                let bodyMesh = bodyNode.mesh.getChildMeshes(false).find(candidate => (
                  candidate._mt5NodeAddress === bodyNode.addr
                  && candidate._mt5SourceVertexIndices.includes(sourceIndex)
                ));
                let bodyIndex = bodyMesh?._mt5SourceVertexIndices.indexOf(sourceIndex);
                if (!bodyMesh) {
                  bodyMesh = renderRoot.getChildMeshes(false).find(candidate => {
                    const index = candidate._mt5SourceVertexIndices?.findIndex((value, i) => (
                      value === sourceIndex
                      && (candidate._mt5SourceNodeAddresses?.[i] ?? candidate._mt5NodeAddress) === parent.addr
                    ));
                    if (index === undefined || index < 0) return false;
                    bodyIndex = index;
                    return true;
                  });
                  assert.ok(bodyMesh?._mt5SourceNodeAddresses, "parent-only seam retains provenance through GPU batching");
                }
                assert.ok(bodyMesh, `${actorTag} seam source ${sourceIndex}`);
                const expected = BABYLON.Vector3.TransformCoordinates(
                  BABYLON.Vector3.FromArray(bodyMesh.getPositionData(true, true), bodyIndex * 3),
                  bodyMesh.computeWorldMatrix(true),
                );
                const actual = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(posed, index * 3), world);
                assertVectorClose(actual.asArray(), expected.asArray(), `${actorTag} lease ${lease} frame ${frame} seam ${relative}`, 1e-5);
                checked += 1;
              }
              assert.equal(mesh.computeBonesUsingShaders, true, "FACE remains GPU skinned");
            }
            assert.equal(checked, integration.boundExternalParentVertexCount);
            assert.ok(checked > 0);
          }
          assert.equal(faces.end(owner), true);
          assert.equal(integration.seamBindings.size, 0, "released lease holds no body seam bindings");
          for (const [mesh, indices] of originalIndices) assert.deepEqual(Array.from(mesh.getIndices()), indices);
        }
      } finally { scene.dispose(); }
    }
  } finally { engine.dispose(); }
});

test("every OP00 FACE binding transfers body surfaces at its authored seam", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    for (const [actorTag, fixture] of Object.entries(BODY_FACE_FIXTURES)) {
      const definition = inventory.facialAssets[actorTag];
      const bodyLoader = new Mt5Loader(scene, {
        backFaceCulling: false,
        mirrorCharacterX: true,
        characterRigMode: "gpu",
      });
      const [bodyRoot] = await bodyLoader.load(arrayBuffer(fixture.path), null);
      const bodyFaceNode = bodyRoot._mt5Nodes.find(
        node => signedRenderKey(node) === definition.attachmentRenderKey && node.model,
      );
      assert.ok(bodyFaceNode, actorTag);

      const faceLoader = new Mt5Loader(scene, {
        backFaceCulling: false,
        mirrorCharacterX: true,
        characterRigMode: "gpu",
        textureAddressMode: "clamp",
        respectStripWindingSign: true,
      });
      const [faceRoot] = await faceLoader.load(
        arrayBuffer(definition.model.path),
        null,
      );
      const faceAttachmentNode = faceRoot._mt5Nodes.find(
        node => signedRenderKey(node) === definition.faceRootRenderKey && node.model,
      );
      assert.ok(faceAttachmentNode, actorTag);
      assertNativeTriangleWinding(faceRoot);

      const ryoHairCard = actorTag === "AKIR"
        ? bodyRoot.getChildMeshes(false).find(
          mesh => mesh.metadata?.mt5TextureId === "a64b425f4b414d5f",
        )
        : null;
      const originalRyoHairIndices = ryoHairCard
        ? Array.from(ryoHairCard.getIndices())
        : null;

      const originalIndexCount = subtreeIndexCount(bodyFaceNode.mesh);
      const integration = integrateBodyFaceSurface({
        bodyModelRoot: bodyRoot,
        bodyFaceNode,
        bodyLoader,
        faceRoot,
        faceAttachmentNode,
        faceEyeNodes: definition.eyeRenderKeys.map(renderKey => (
          faceRoot._mt5Nodes.find(
            node => signedRenderKey(node) === renderKey && node.model,
          )
        )),
        faceLoader,
      });
      assert.equal(integration.removedTriangleCount, fixture.removed, actorTag);
      assert.equal(integration.retainedTriangleCount, fixture.retained, actorTag);
      assertNativeTriangleWinding(faceRoot);
      assert.ok(
        integration.boundExternalParentVertexCount > 0,
        `${actorTag} must resolve its signed body-parent references`,
      );
      const bodyParentNode = bodyRoot._mt5Nodes.find(
        node => node.addr === bodyFaceNode.parentAddr && node.model,
      );
      assert.ok(bodyParentNode, `${actorTag} body FACE parent`);
      const inverseBodyAttachmentLocal = Mt5Loader.inverseSourceTransformMatrix(
        bodyFaceNode,
      );
      let verifiedParentVertices = 0;
      for (const mesh of faceAttachmentNode.mesh.getChildMeshes(false)) {
        const offsets = mesh._mt5ExternalParentVertexOffsets;
        if (!offsets) continue;
        for (let vertexIndex = 0; vertexIndex < offsets.length; vertexIndex += 1) {
          const relativeIndex = offsets[vertexIndex];
          if (relativeIndex >= 0) continue;
          const parent = bodyLoader.globalVertices[
            bodyParentNode.model.vertexBase
            + bodyParentNode.model.nbVertex
            + relativeIndex
          ];
          const expected = Mt5Loader.transformRowPoint(
            parent.sourcePos,
            inverseBodyAttachmentLocal,
          );
          const offset = vertexIndex * 3;
          assertVectorClose(
            mesh._mt5SourcePositions.slice(offset, offset + 3),
            expected,
            `${actorTag} signed parent vertex ${relativeIndex}`,
          );
          verifiedParentVertices += 1;
        }
      }
      assert.equal(
        verifiedParentVertices,
        integration.boundExternalParentVertexCount,
        `${actorTag} must bind every rendered signed parent vertex`,
      );
      const replacedAuthoredDescendant = integration.patches.some(
        patch => patch.mesh._mt5NodeAddress !== bodyFaceNode.addr,
      );
      assert.equal(
        replacedAuthoredDescendant,
        fixture.replacesAuthoredDescendant,
        actorTag,
      );
      assert.ok(subtreeIndexCount(bodyFaceNode.mesh) < originalIndexCount, actorTag);
      if (ryoHairCard) {
        assert.deepEqual(
          Array.from(ryoHairCard.getIndices()),
          originalRyoHairIndices,
          "AKIR rear hair cards are overlays, not FACE replacement surfaces",
        );
      }
      restoreBodyFaceSurface(integration);
      assert.equal(subtreeIndexCount(bodyFaceNode.mesh), originalIndexCount, actorTag);
      for (const patch of integration.patches) {
        assert.deepEqual(Array.from(patch.mesh.getIndices()), patch.indices, actorTag);
      }

      bodyRoot.dispose(false, true);
      faceRoot.dispose(false, true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("FUB exact FACE resource overlaps its authored FUB body attachment", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    const definition = tgma.facialAssets.FUKU;
    const bodyLoader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      characterRigMode: "gpu",
    });
    const [bodyRoot] = await bodyLoader.load(
      arrayBuffer("play/assets/characters/FUB_M.CHRM"),
      null,
    );
    const bodyFaceNode = bodyRoot._mt5Nodes.find(
      node => signedRenderKey(node) === definition.attachmentRenderKey && node.model,
    );
    assert.ok(bodyFaceNode);

    const faceLoader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      characterRigMode: "gpu",
      textureAddressMode: "clamp",
      respectStripWindingSign: true,
    });
    const [faceRoot] = await faceLoader.load(arrayBuffer(definition.model.path), null);
    const faceAttachmentNode = faceRoot._mt5Nodes.find(
      node => signedRenderKey(node) === definition.faceRootRenderKey && node.model,
    );
    const eyeNodes = definition.eyeRenderKeys.map(renderKey => (
      faceRoot._mt5Nodes.find(
        node => signedRenderKey(node) === renderKey && node.model,
      )
    ));
    assert.ok(faceAttachmentNode);
    assert.ok(eyeNodes.every(Boolean));

    const integration = integrateBodyFaceSurface({
      bodyModelRoot: bodyRoot,
      bodyFaceNode,
      bodyLoader,
      faceRoot,
      faceAttachmentNode,
      faceEyeNodes: eyeNodes,
      faceLoader,
    });
    assert.ok(integration.removedTriangleCount > 0);
    assert.ok(integration.boundExternalParentVertexCount > 0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
