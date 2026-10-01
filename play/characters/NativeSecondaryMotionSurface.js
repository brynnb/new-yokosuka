import * as BABYLON from "@babylonjs/core";
import { vertexSkinMatrix } from "../../src/NativeAttachmentSeam.js";
import { NATIVE_RADIAL_SURFACE_LENGTH_FLOOR } from "../data/native-articulated-surface.web.js";
import { NATIVE_OSAG_RADIAL_SURFACE_NODE_TYPE } from "./NativeSecondaryMotionProfiles.js";

export function prepareNativeSecondaryMotionSurfaces(root) {
  const nodes = (root?._mt5Nodes || []).filter(node => (
    (node.flag & 0xffff) === NATIVE_OSAG_RADIAL_SURFACE_NODE_TYPE
  ));
  for (const node of nodes) {
    for (const mesh of node.mesh?.getChildMeshes(false) || []) {
      if (mesh._mt5NodeAddress === node.addr) mesh._mt5NativeVertexSurface = true;
    }
  }
  return Object.freeze({ preservedRenderKeys: Object.freeze([...new Set(nodes.map(node => node.flag & 0xffff))]) });
}

/** FUN_0c13672c projects original vertices outside the owner's first sphere.
 * There is no wind, spring, random animation, or normal recalculation here.
 */
export function projectNativeSecondarySurfacePoint(point, sphere, lengthScale = 1) {
  const delta = point.subtract(sphere.center);
  const length = Math.max(delta.length(), NATIVE_RADIAL_SURFACE_LENGTH_FLOOR * lengthScale);
  return length < sphere.radius ? sphere.center.add(delta.scale(sphere.radius / length)) : point;
}

export class NativeSecondaryMotionSurface {
  constructor(model, node) {
    this.model = model;
    this.node = node;
    const rig = model.renderRoot._mt5CharacterGpuRig;
    if (!rig) throw new Error("native vertex surface requires the shared GPU body rig");
    this.meshes = rig.skinnedMeshes.filter(mesh => mesh._mt5NodeAddress === node.addr).map(mesh => ({
      mesh, skeleton: mesh.skeleton, shaderSkinning: mesh.computeBonesUsingShaders,
      basePositions: Float32Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
      baseNormals: Float32Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind)),
      positions: new Float32Array(mesh.getTotalVertices() * 3),
      normals: new Float32Array(mesh.getTotalVertices() * 3),
    }));
    if (node.model?.nbVertex > 0 && this.meshes.length === 0) {
      throw new Error(`native vertex surface ${node.addr} was lost during body batching`);
    }
    this.acquired = false;
  }

  update(sphere, lengthScale = 1) {
    if (!sphere) return false; // No body controller pose yet: keep GPU skinning.
    const skin = BABYLON.Matrix.Identity();
    for (const state of this.meshes) {
      const { mesh } = state;
      state.skeleton.prepare(true);
      const matrices = state.skeleton.getTransformMatrices(mesh);
      const world = mesh.computeWorldMatrix(true);
      const inverseWorld = BABYLON.Matrix.Invert(world);
      for (let vertex = 0; vertex < mesh.getTotalVertices(); vertex++) {
        vertexSkinMatrix(mesh, vertex, matrices, skin);
        skin.multiplyToRef(world, skin);
        let point = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(state.basePositions, vertex * 3), skin);
        const sourceIndex = mesh._mt5SourceVertexIndices[vertex];
        // Signed strip indices borrow their parent's immutable vertex buffer.
        // Only this node's own source vertices are modified by the handler.
        if (sourceIndex >= this.node.model.vertexBase
          && sourceIndex < this.node.model.vertexBase + this.node.model.nbVertex) {
          point = projectNativeSecondarySurfacePoint(point, sphere, lengthScale);
        }
        BABYLON.Vector3.TransformCoordinates(point, inverseWorld).toArray(state.positions, vertex * 3);
        BABYLON.Vector3.TransformNormal(BABYLON.Vector3.TransformNormal(
          BABYLON.Vector3.FromArray(state.baseNormals, vertex * 3), skin,
        ), inverseWorld).normalize().toArray(state.normals, vertex * 3);
      }
      if (!this.acquired) {
        mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, state.positions, true);
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, state.normals, true);
        // As with CLTH, only this tiny native vertex-owned surface leaves GPU
        // skinning. Keeping its skeleton would apply the body pose twice.
        mesh.skeleton = null;
        mesh.computeBonesUsingShaders = false;
      } else {
        mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, state.positions);
        mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, state.normals);
      }
      mesh.refreshBoundingInfo();
    }
    this.acquired = true;
    return true;
  }

  release() {
    if (!this.acquired) return;
    for (const { mesh, skeleton, shaderSkinning, basePositions, baseNormals } of this.meshes) {
      mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, basePositions);
      mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, baseNormals);
      mesh.skeleton = skeleton;
      mesh.computeBonesUsingShaders = shaderSkinning;
      mesh.refreshBoundingInfo();
    }
    this.acquired = false;
  }
}
