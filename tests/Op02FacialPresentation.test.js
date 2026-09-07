import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import manifest from "../play/assets/introduction/op02/manifest.json" with {
  type: "json",
};
import {
  createNativeAseqFacialPresentation,
} from "../play/events/NativeAseqFacialPresentation.js";
import { Mt5Loader } from "../src/Mt5Loader.js";

function arrayBuffer(filename) {
  const value = readFileSync(filename);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

function signedRenderKey(node) {
  const low16 = node.flag & 0xffff;
  return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

test("OP02 Shenhua FACE follows the scaled native head attachment", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    const definition = manifest.facialAssets.SINF;
    assert.equal(definition.bodyModelCode, "MGR_M");
    assert.equal(definition.attachmentRenderKey, -67);

    const bodyLoader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      characterRigMode: "gpu",
    });
    const [bodyRoot] = await bodyLoader.load(
      arrayBuffer(manifest.packageActors.SINF.assetPath),
      null,
      { sourceFilename: "MGR_M.CHRM" },
    );
    bodyLoader.mergeCharacterGpuRigMeshes(bodyRoot, {
      preserveRenderKeySubtrees: [definition.attachmentRenderKey],
    });
    bodyLoader.applyCharacterRigWorldMatrices(bodyRoot, null);
    const bodyFaceNode = bodyRoot._mt5Nodes.find(node => (
      signedRenderKey(node) === definition.attachmentRenderKey && node.model
    ));
    assert.ok(bodyFaceNode);
    const bodyFaceMatrix = bodyLoader.sourceWorldMatrixForNode(bodyFaceNode);
    assert.equal(Math.hypot(
      bodyFaceMatrix[0], bodyFaceMatrix[1], bodyFaceMatrix[2],
    ), 10);

    const actorRoot = new BABYLON.TransformNode("SINF", scene);
    bodyRoot.parent = actorRoot;
    const actorModel = {
      loader: bodyLoader,
      renderRoot: bodyRoot,
      root: actorRoot,
      modelCode: "MGR_M",
    };
    const presentation = createNativeAseqFacialPresentation({
      scene,
      actors: {
        activeActor: actorTag => actorTag === "SINF"
          ? { actorCode: "SINF", root: actorRoot, model: actorModel }
          : null,
        componentWorldPosition: () => null,
      },
      definitions: manifest.facialAssets,
      loadAsset: arrayBuffer,
    });
    await presentation.prepare({ actors: ["SINF"] });
    const detailedEntry = presentation.entries.get("SINF");
    assert.equal(detailedEntry.loader.textureIds.size, 10);
    assert.equal(detailedEntry.loader.textureCache.size, 10);
    assert.equal(
      [...detailedEntry.loader.materialCache.values()].filter(
        material => material.diffuseTexture,
      ).length,
      8,
    );
    const owner = {};
    assert.equal(presentation.begin(owner, ["SINF"]), true);
    const integration = presentation.active.faces.get("SINF")
      .surfaceIntegration;
    assert.equal(integration.boundExternalParentVertexCount, 0);
    assert.equal(integration.removedTriangleCount, 3502);
    assert.equal(integration.retainedTriangleCount, 2488);
    const bodySkin = bodyRoot.getChildMeshes(false).find(
      mesh => mesh.metadata?.mt5TextureId === "a049485f6b616f5f",
    );
    assert.ok(bodySkin);
    assert.equal(
      bodySkin.getTotalIndices() / 3,
      66,
      "the seam-less detailed face must retain a continuous body neck band",
    );
    const detailedRoot = presentation.active.faces.get("SINF").entry.root;
    assert.equal(detailedRoot.parent, bodyRoot);
    assert.equal(detailedRoot.isEnabled(), true);
    assert.equal(presentation.apply(owner, { frame: 0 }), true);
    assert.equal(presentation.end(owner), true);
    assert.equal(presentation.active, null);
    assert.equal(detailedRoot.parent, null);
    assert.equal(detailedRoot.isEnabled(), false);

    // FACE ownership is AUTH-local while its prepared resource is package
    // owned. Reacquiring it must integrate and restore the same authored
    // surface cleanly across the next camera activity.
    const nextOwner = {};
    assert.equal(presentation.begin(nextOwner, ["SINF"]), true);
    assert.equal(
      presentation.active.faces.get("SINF").surfaceIntegration
        .removedTriangleCount,
      3502,
    );
    assert.equal(presentation.end(nextOwner), true);
    assert.equal(detailedRoot.parent, null);
    assert.equal(detailedRoot.isEnabled(), false);

    // A multi-shot program integrates the expensive detailed FACE surface
    // once. Individual AUTH camera shots only toggle/use that owned surface.
    const programOwner = {};
    assert.equal(presentation.beginProgram(programOwner, ["SINF"]), true);
    const programIntegration = presentation.program.faces.get("SINF")
      .surfaceIntegration;
    const firstShotOwner = {};
    assert.equal(presentation.begin(firstShotOwner, ["SINF"]), true);
    assert.equal(
      presentation.active.faces.get("SINF").surfaceIntegration,
      programIntegration,
    );
    presentation.active.faces.get("SINF").cueIndex = 4;
    presentation.active.faces.get("SINF").prefetched = true;
    assert.equal(presentation.end(firstShotOwner), true);
    assert.equal(detailedRoot.parent, bodyRoot);
    assert.equal(detailedRoot.isEnabled(), false);
    const secondShotOwner = {};
    assert.equal(presentation.begin(secondShotOwner, ["SINF"]), true);
    assert.equal(presentation.active.faces.get("SINF").cueIndex, -1);
    assert.equal(presentation.active.faces.get("SINF").prefetched, false);
    assert.equal(presentation.apply(secondShotOwner, { frame: 1 }), true);
    assert.equal(
      presentation.active.faces.get("SINF").surfaceIntegration,
      programIntegration,
    );
    assert.equal(presentation.end(secondShotOwner), true);
    assert.equal(presentation.endProgram(programOwner), true);
    assert.equal(detailedRoot.parent, null);
    assert.equal(detailedRoot.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
