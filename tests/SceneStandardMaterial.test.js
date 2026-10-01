import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import { SceneStandardMaterial } from "../src/rendering/SceneStandardMaterial.js";
import { markWorldMeshDynamic } from "../src/rendering/SceneSpatialIndex.js";

test("static world shader cache respects Babylon invalidation and keeps per-mesh binding live", async () => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  try {
    const camera = new B.FreeCamera("camera", new B.Vector3(0, 0, -10), scene);
    camera.setTarget(B.Vector3.Zero());
    const sun = new B.HemisphericLight("sun", B.Vector3.Up(), scene);
    const material = new SceneStandardMaterial("shared map", scene);
    const first = B.MeshBuilder.CreateBox("first", {}, scene);
    const second = B.MeshBuilder.CreateBox("second", {}, scene);
    second.position.x = 2;
    for (const mesh of [first, second]) {
      mesh.material = material;
      mesh.metadata = {staticWorldGeometry: true};
      mesh.freezeWorldMatrix();
    }
    await material.forceCompilationAsync(first);
    await material.forceCompilationAsync(second);
    scene.render();
    const original = B.StandardMaterial.prototype.isReadyForSubMesh;
    let slowChecks = 0;
    B.StandardMaterial.prototype.isReadyForSubMesh = function(...args) {
      slowChecks++;
      return original.apply(this, args);
    };
    try {
      scene.render();
      assert.equal(slowChecks, 0, "prepared map submeshes skip redundant readiness work");
      assert.equal(material.isFrozen, false);
      assert.equal(material.bindForSubMesh, B.StandardMaterial.prototype.bindForSubMesh);
      for (const change of [
        () => { material.maxSimultaneousLights = 6; },
        () => { material.fogEnabled = false; },
        () => { material.markDirty(); },
        () => { first.useVertexColors = false; },
        () => { scene.clipPlane = new B.Plane(1, 0, 0, 0); },
        () => { scene.clipPlane = null; },
        () => { camera.mode = B.Camera.ORTHOGRAPHIC_CAMERA; },
        () => { camera.mode = B.Camera.PERSPECTIVE_CAMERA; },
        () => { engine.setColorWrite(false); },
        () => { engine.setColorWrite(true); },
      ]) {
        slowChecks = 0;
        change();
        scene.render();
        assert.ok(slowChecks > 0, "dirty shader state takes the normal readiness path");
      }
      assert.equal(first.subMeshes[0].materialDefines.CLIPPLANE, false);
      assert.equal(first.subMeshes[0].materialDefines.CAMERA_PERSPECTIVE, true);
      assert.equal(first.subMeshes[0].materialDefines.DEPTHPREPASS, false);
      const lightReady = sun.areLightTexturesReady;
      sun.areLightTexturesReady = () => false;
      assert.equal(material.isReadyForSubMesh(first, first.subMeshes[0]), false,
        "a ready shader must still wait for its light resources");
      sun.areLightTexturesReady = lightReady;
      assert.equal(material.isReadyForSubMesh(first, first.subMeshes[0]), true);
      material.checkReadyOnEveryCall = true;
      slowChecks = 0;
      scene.render();
      assert.ok(slowChecks >= 2);
      material.checkReadyOnEveryCall = false;
      markWorldMeshDynamic(first);
      slowChecks = 0;
      scene.render();
      assert.ok(slowChecks > 0, "a moving script owner leaves the static cache");
    } finally { B.StandardMaterial.prototype.isReadyForSubMesh = original; }
  } finally { scene.dispose(); engine.dispose(); }
});
