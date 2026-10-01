import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { loadNativeCharacterModel } from "../play/characters/NativeCharacterModelLoader.js";
import { NativeSecondaryMotionModelState } from "../play/characters/NativeSecondaryMotionRuntime.js";
import { projectNativeSecondarySurfacePoint } from "../play/characters/NativeSecondaryMotionSurface.js";
import { nativeSecondaryMotionRadialProfile } from "../play/characters/NativeSecondaryMotionCollision.js";
import { controllerFamilyByIndex } from "../play/characters/NpcControllerFamilies.js";
import { authoredControllerFamilyIndexFromMt5 } from "../src/Mt5ControllerFamily.js";

test("native radial projection is immutable and preserves the native zero-distance case", () => {
  const sphere = { center: BABYLON.Vector3.Zero(), radius: 1 };
  const point = new BABYLON.Vector3(.25, 0, 0);
  assert.deepEqual(projectNativeSecondarySurfacePoint(point, sphere).asArray(), [1, 0, 0]);
  assert.deepEqual(point.asArray(), [.25, 0, 0]);
  assert.deepEqual(projectNativeSecondarySurfacePoint(BABYLON.Vector3.Zero(), sphere).asArray(), [0, 0, 0]);
  assert.deepEqual(projectNativeSecondarySurfacePoint(new BABYLON.Vector3(2, 0, 0), sphere).asArray(), [2, 0, 0]);
  assert.equal(nativeSecondaryMotionRadialProfile("YAB_L").sourceAddress, "0x0c2989a8");
  assert.equal(nativeSecondaryMotionRadialProfile("KOK_M").sourceAddress, "0x0c297f98");
  assert.equal(nativeSecondaryMotionRadialProfile("SYU_M").sourceAddress, "0x0c298938");
  assert.equal(nativeSecondaryMotionRadialProfile("unlisted").sourceAddress, "0x0c298238",
    "unlisted models use the original selector's default");
});

test("vertex surfaces survive batching, update without compounding, and return to GPU ownership", async () => {
  const engine = new BABYLON.NullEngine();
  try {
    for (const modelCode of ["YAB_L", "SYU_M"]) {
      const scene = new BABYLON.Scene(engine);
      try {
        const bytes = fs.readFileSync(`play/assets/characters/${modelCode}.CHRM`);
        const { loader, renderRoot } = await loadNativeCharacterModel({ scene,
          modelBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), sourceFilename: `${modelCode}.CHRM` });
        // Cutscene variants need not appear in the ordinary NPC inventory.
        // Read the original CHRM selector, as the AUTH loader does.
        const family = controllerFamilyByIndex(authoredControllerFamilyIndexFromMt5(bytes));
        const model = { loader, renderRoot, modelCode, latestControllerFamily: family,
          latestControllerMatrices: family.nodes.map(() => BABYLON.Matrix.Identity().asArray()) };
        const state = new NativeSecondaryMotionModelState(model);
        assert.equal(state.surfaces.length, 1);
        const surface = state.surfaces[0], meshState = surface.meshes[0];
        const { mesh, basePositions } = meshState;
        assert.ok(mesh._mt5NativeVertexSurface);
        const ownVertex = mesh._mt5SourceVertexIndices.findIndex(index => index >= surface.node.model.vertexBase
          && index < surface.node.model.vertexBase + surface.node.model.nbVertex);
        assert.ok(ownVertex >= 0);
        const point = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(basePositions, ownVertex * 3), mesh.computeWorldMatrix(true));
        const sphere = { center: point.add(new BABYLON.Vector3(.02, 0, 0)), radius: .04 };
        surface.update(sphere);
        const once = Array.from(mesh.getVerticesData("position"));
        assert.notDeepEqual(once, Array.from(basePositions));
        assert.equal(mesh.skeleton, null);
        surface.update(sphere);
        assert.deepEqual(Array.from(mesh.getVerticesData("position")), once);
        // Production hookup uses native controller 47's first sphere.
        const profile = nativeSecondaryMotionRadialProfile(modelCode);
        model.latestControllerMatrices[family.nodes.find(node => node.type === 47).index] = BABYLON.Matrix.Translation(
          sphere.center.x - profile.points[0].localPosition[0], sphere.center.y - profile.points[0].localPosition[1],
          sphere.center.z - profile.points[0].localPosition[2]).asArray();
        state.update(1 / 30);
        assert.equal(surface.acquired, true);
        state.release();
        assert.equal(mesh.skeleton, meshState.skeleton);
        assert.equal(mesh.computeBonesUsingShaders, true);
        assert.deepEqual(Array.from(mesh.getVerticesData("position")), Array.from(basePositions));
        assert.ok(renderRoot._mt5CharacterGpuRig.skinnedMeshes.filter(other => other !== mesh).every(other => other.skeleton),
          "only the small vertex-owned surface leaves GPU skinning");
      } finally { scene.dispose(); }
    }
  } finally { engine.dispose(); }
});
