import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import {
  AreLightsTexturesReady,
  PrepareDefinesForCamera,
  PrepareDefinesForFrameBoundValues,
} from "@babylonjs/core/Materials/materialHelper.functions.js";
import { MaterialHelperGeometryRendering } from "@babylonjs/core/Materials/materialHelper.geometryrendering.js";

/**
 * Reuse prepared shaders for immutable map batches, without freezing binding.
 * Full material freezing also caches per-mesh uniforms and previously broke
 * shared MT7 materials. World/camera/fog/light/texture uniforms still bind via
 * StandardMaterial on every ordinary draw here.
 */
export class SceneStandardMaterial extends StandardMaterial {
  isReadyForSubMesh(mesh, subMesh, useInstances = false) {
    const defines = subMesh.materialDefines;
    const wrapper = subMesh._drawWrapper;
    const scene = this.getScene();
    const engine = scene.getEngine();
    if (
      mesh.metadata?.staticWorldGeometry === true
      && mesh.metadata?.dynamicWorldGeometry !== true
      && mesh.isWorldMatrixFrozen
      && !mesh.skeleton && !mesh.morphTargetManager
      && !mesh.bakedVertexAnimationManager && !useInstances
      && !mesh.hasThinInstances
      && !this.checkReadyOnEveryCall
      && defines && !defines.isDirty
      && wrapper?._wasPreviouslyReady
      && wrapper._wasPreviouslyUsingInstances === useInstances
      && wrapper.materialContext === this._materialContext
      && wrapper.effect?.isReady()
      // Specialized render paths and plugins retain their own readiness hooks.
      && !this.pluginManager?._activePlugins.length
      && !scene.prePassRenderer?.enabled && !defines.PREPASS
      && !scene.useOrderIndependentTransparency && !defines.ORDER_INDEPENDENT_TRANSPARENCY
      && !scene.activeCamera?.outputRenderTarget && !defines.MULTIVIEW
      && !MaterialHelperGeometryRendering.GetConfiguration(engine.currentRenderPassId)
    ) {
      // Babylon owns these per-submesh/per-render-pass caches. Its normal
      // dirty flags, markDirty, context restoration and effect replacement
      // invalidate readiness; do not keep a separate material-wide cache.
      // Clip planes, camera projection and depth-only passes are frame state,
      // not material setters. Let Babylon detect those changes before reuse.
      // Check projection separately: Babylon 9.18's frame helper overwrites
      // its camera-change result when it also checks clip planes.
      if (PrepareDefinesForCamera(scene, defines)) defines.markAsUnprocessed();
      PrepareDefinesForFrameBoundValues(scene, engine, this, defines, useInstances);
      if (!defines.isDirty) {
        if (!AreLightsTexturesReady(scene, mesh, this.maxSimultaneousLights, this.disableLighting)) return false;
        if ((defines.AREALIGHTUSED || defines.CLUSTLIGHT_BATCH)
          && mesh.lightSources.some(light => !light._isReady())) return false;
        return true;
      }
      defines._renderId = -1;
    }
    return super.isReadyForSubMesh(mesh, subMesh, useInstances);
  }
}
