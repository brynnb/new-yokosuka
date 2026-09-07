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
    removed: 532,
    retained: 152,
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
    removed: 566,
    retained: 148,
    replacesAuthoredDescendant: false,
  }),
  SORY: Object.freeze({
    path: "play/assets/characters/KOK_M.CHRM",
    removed: 909,
    retained: 177,
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

function triangleWindingAgreement(root) {
  let aligned = 0;
  let evaluated = 0;
  for (const mesh of root.getChildMeshes(false)) {
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    const indices = mesh.getIndices();
    if (!positions || !normals || !indices) continue;
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      const corners = [0, 1, 2].map(index => indices[offset + index] * 3);
      const firstSecond = [0, 1, 2].map(axis => (
        positions[corners[1] + axis] - positions[corners[0] + axis]
      ));
      const firstThird = [0, 1, 2].map(axis => (
        positions[corners[2] + axis] - positions[corners[0] + axis]
      ));
      const geometricNormal = [
        firstSecond[1] * firstThird[2] - firstSecond[2] * firstThird[1],
        firstSecond[2] * firstThird[0] - firstSecond[0] * firstThird[2],
        firstSecond[0] * firstThird[1] - firstSecond[1] * firstThird[0],
      ];
      const authoredNormal = [0, 1, 2].map(axis => corners.reduce(
        (sum, corner) => sum + normals[corner + axis],
        0,
      ));
      const agreement = geometricNormal.reduce(
        (sum, value, axis) => sum + value * authoredNormal[axis],
        0,
      );
      if (Math.abs(agreement) <= 1e-12) continue;
      evaluated += 1;
      if (agreement > 0) aligned += 1;
    }
  }
  return { aligned, evaluated };
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
    const winding = triangleWindingAgreement(faceEntry.root);
    assert.ok(winding.evaluated > 0);
    assert.equal(winding.aligned, winding.evaluated);
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
    assert.ok(integratedBodyIndexCount > 0);
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
    const boundWinding = triangleWindingAgreement(faceEntry.root);
    assert.ok(boundWinding.evaluated > 0);
    assert.equal(boundWinding.aligned, boundWinding.evaluated);
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
    assert.equal(faces.play(owner, {
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
    }), true);
    for (let frame = 2; frame <= 3; frame += 1) {
      assert.equal(faces.apply(owner, { frame }), true);
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
  } finally {
    scene.dispose();
    engine.dispose();
  }
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
        orientTriangleWindingToNormals: true,
      });
      const [faceRoot] = await faceLoader.load(
        arrayBuffer(definition.model.path),
        null,
      );
      const faceAttachmentNode = faceRoot._mt5Nodes.find(
        node => signedRenderKey(node) === definition.faceRootRenderKey && node.model,
      );
      assert.ok(faceAttachmentNode, actorTag);
      const winding = triangleWindingAgreement(faceRoot);
      assert.ok(winding.evaluated > 0, actorTag);
      assert.equal(winding.aligned, winding.evaluated, actorTag);

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
      orientTriangleWindingToNormals: true,
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
