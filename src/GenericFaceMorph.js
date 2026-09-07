import * as BABYLON from "@babylonjs/core";
import { transformRowVector } from "./Mt5Transform.js";

const FACE_PATCH_RENDER_KEY = -0x44;
const POSITION_EPSILON = 1e-7;

function signedRenderKey(node) {
  const low = Number(node?.flag) & 0xffff;
  return low >= 0x8000 ? low - 0x10000 : low;
}

function sourcePosition(loader, model, localIndex, field = "pos") {
  return loader?.globalVertices?.[model.vertexBase + localIndex]?.[field] || null;
}

function positionsMatch(loader, first, second) {
  if (first.nbVertex !== second.nbVertex) return false;
  for (let index = 0; index < first.nbVertex; index += 1) {
    const left = sourcePosition(loader, first, index);
    const right = sourcePosition(loader, second, index);
    if (!left || !right) return false;
    if (
      Math.abs(left[0] - right[0]) > POSITION_EPSILON
      || Math.abs(left[1] - right[1]) > POSITION_EPSILON
      || Math.abs(left[2] - right[2]) > POSITION_EPSILON
    ) return false;
  }
  return true;
}

function patchMeshes(node) {
  return [node.mesh, ...(node.mesh?.getChildMeshes?.(false) || [])].filter(
    mesh => mesh instanceof BABYLON.Mesh
      && mesh._mt5NodeAddress === node.addr
      && mesh._mt5SourceVertexIndices
      && mesh.isVerticesDataPresent(BABYLON.VertexBuffer.PositionKind),
  );
}

/**
 * Resolve the native generic-character mouth structure without model names.
 * One attached -68 patch is the render destination. Exactly two detached -68
 * models are authored sources; the source identical to the destination is the
 * closed pose, and the other is the open pose.
 */
export function resolveGenericFaceMorph(model) {
  const loader = model?.loader;
  const root = model?.renderRoot;
  if (!loader || !Array.isArray(root?._mt5Nodes)) return null;
  const patches = root._mt5Nodes.filter(node => (
    signedRenderKey(node) === FACE_PATCH_RENDER_KEY
    && node.model
    && Number.isInteger(node.model.vertexBase)
    && Number.isInteger(node.model.nbVertex)
    && node.model.nbVertex > 0
  ));
  const destinations = patches.filter(node => Boolean(node.parentAddr));
  const sources = patches.filter(node => !node.parentAddr);
  if (destinations.length !== 1 || sources.length !== 2) return null;
  const destination = destinations[0];
  if (sources.some(node => node.model.nbVertex !== destination.model.nbVertex)) {
    return null;
  }
  const matching = sources.filter(node => positionsMatch(
    loader,
    destination.model,
    node.model,
  ));
  if (matching.length !== 1) return null;
  const closed = matching[0];
  const open = sources.find(node => node !== closed);
  if (!open || positionsMatch(loader, closed.model, open.model)) return null;

  const baked = root._mt5CharacterRigBaked === true;
  const bindMatrix = baked ? loader.sourceWorldMatrixForNode(destination) : null;
  const sourceField = baked ? "sourcePos" : "pos";
  const meshes = patchMeshes(destination).map((mesh) => {
    const original = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const closedPositions = Float32Array.from(original);
    const openPositions = Float32Array.from(original);
    for (let index = 0; index < mesh._mt5SourceVertexIndices.length; index += 1) {
      const sourceIndex = mesh._mt5SourceVertexIndices[index];
      const localIndex = sourceIndex - destination.model.vertexBase;
      if (localIndex < 0 || localIndex >= destination.model.nbVertex) continue;
      const closedPosition = sourcePosition(loader, closed.model, localIndex, sourceField);
      const openPosition = sourcePosition(loader, open.model, localIndex, sourceField);
      if (!closedPosition || !openPosition) return null;
      // The GPU rig's vertex buffer is already in bind-world space (and may
      // have welded boundary vertices). Raw morph targets are node-local.
      // Preserve the prepared closed mesh and transform only the authored
      // displacement into its buffer space. Writing raw target positions here
      // tears the mouth away from the face, including when speech is stopped.
      const sourceDelta = openPosition.map((value, axis) => value - closedPosition[axis]);
      const delta = bindMatrix ? transformRowVector(sourceDelta, bindMatrix) : sourceDelta;
      for (let axis = 0; axis < 3; axis += 1) {
        openPositions[index * 3 + axis] += delta[axis];
      }
    }
    return Object.freeze({ mesh, closedPositions, openPositions });
  });
  if (meshes.length === 0) return null;
  return Object.freeze({
    destination,
    closed,
    open,
    meshes: Object.freeze(meshes),
  });
}

export class GenericFaceMorphController {
  constructor(binding) {
    if (!binding?.meshes?.length) {
      throw new TypeError("generic face morph requires a structural binding");
    }
    this.binding = binding;
    for (const record of binding.meshes) {
      const buffer = record.mesh.getVertexBuffer(
        BABYLON.VertexBuffer.PositionKind,
      );
      if (!buffer?.isUpdatable?.()) {
        // Creating an updatable buffer otherwise replaces the rig's animated
        // culling bounds with the mouth's bind-pose bounds, hiding it until
        // the next body pose update (or longer while the actor is paused).
        const bounds = record.mesh.getBoundingInfo();
        const minimum = bounds.minimum.clone();
        const maximum = bounds.maximum.clone();
        record.mesh.setVerticesData(
          BABYLON.VertexBuffer.PositionKind,
          record.closedPositions,
          true,
        );
        record.mesh.getBoundingInfo().reConstruct(
          minimum, maximum, record.mesh.getWorldMatrix(),
        );
      }
    }
    this.weight = 0;
    this.targetWeight = 0;
    this.transitionTicksRemaining = 0;
    this.apply();
  }

  transition(open, ticks) {
    if (!Number.isInteger(ticks) || ticks <= 0) {
      throw new TypeError("generic face transition ticks must be positive");
    }
    this.targetWeight = open ? 1 : 0;
    this.transitionTicksRemaining = ticks;
  }

  advanceTick() {
    if (this.transitionTicksRemaining <= 0) return false;
    this.weight += (
      this.targetWeight - this.weight
    ) / this.transitionTicksRemaining;
    this.transitionTicksRemaining -= 1;
    if (this.transitionTicksRemaining === 0) this.weight = this.targetWeight;
    this.apply();
    return true;
  }

  reset() {
    this.weight = 0;
    this.targetWeight = 0;
    this.transitionTicksRemaining = 0;
    this.apply();
  }

  apply() {
    const weight = this.weight;
    for (const record of this.binding.meshes) {
      const positions = new Float32Array(record.closedPositions.length);
      for (let index = 0; index < positions.length; index += 1) {
        positions[index] = record.closedPositions[index]
          + (record.openPositions[index] - record.closedPositions[index]) * weight;
      }
      record.mesh.updateVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        positions,
        false,
        false,
      );
    }
  }
}
