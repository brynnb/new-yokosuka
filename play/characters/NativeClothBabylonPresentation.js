import * as BABYLON from "@babylonjs/core";

import { NATIVE_CLOTH_MODEL_METADATA } from "../data/native-cloth-models.web.js";
import {
  discoverNativeClothGroups,
  prepareNativeClothModelSurfaces,
} from "./NativeClothModel.js";
import {
  nativeClothBodyCollisionProfile,
  nativeClothClosedRingConstraintProfile,
  nativeClothCharacterProfile,
  nativeClothVelocityDamping,
} from "./NativeClothProfiles.js";
import { NativeClothSimulation } from "./NativeClothSimulation.js";
import { buildNativeClothTopology } from "./NativeClothTopology.js";
import { buildNativeClothBodyColliders } from "./NativeClothCollision.js";
import {
  nativeClothControllerMatricesByType,
} from "./NativeClothControllerPose.js";
import {
  buildNativeClothPointAdvections,
  buildNativeClothRowForces,
} from "./NativeClothForces.js";
import { parseNativeClothTrack } from "./NativeClothTrack.js";

const NATIVE_FRAME_SECONDS = 1 / 30;
const MODEL_STATES = new WeakMap();

function modelMetadataKey(modelCode) {
  const normalized = String(modelCode || "")
    .trim()
    .toUpperCase()
    .replace(/\.(?:CHRM|MT5)$/u, "");
  return normalized || null;
}

function sourcePositions(loader, node) {
  const base = node?.model?.vertexBase;
  const count = node?.model?.nbVertex;
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(count) || count < 1) {
    throw new Error("native cloth node has no source vertex range");
  }
  return Array.from({ length: count }, (_, index) => {
    const source = loader.globalVertices[base + index]?.sourcePos;
    if (!source || source.length < 3 || !source.every(Number.isFinite)) {
      throw new Error(`native cloth source vertex ${base + index} is unavailable`);
    }
    return Object.freeze(Array.from(source));
  });
}

function sourceAuxiliaryEndpoints(loader, node) {
  const base = node?.model?.vertexBase;
  const count = node?.model?.nbVertex;
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(count) || count < 1) {
    throw new Error("native cloth node has no source vertex range");
  }
  return Array.from({ length: count }, (_, index) => {
    const vertex = loader.globalVertices[base + index];
    if (
      !vertex?.sourcePos
      || !vertex?.sourceNorm
      || vertex.sourcePos.length < 3
      || vertex.sourceNorm.length < 3
      || !vertex.sourcePos.every(Number.isFinite)
      || !vertex.sourceNorm.every(Number.isFinite)
    ) {
      throw new Error(
        `native cloth source auxiliary ${base + index} is unavailable`,
      );
    }
    return Object.freeze(vertex.sourcePos.map((value, axis) => (
      value + vertex.sourceNorm[axis]
    )));
  });
}

function sourceNormal(loader, node, vertexIndex) {
  const base = node?.model?.vertexBase;
  const count = node?.model?.nbVertex;
  if (
    !Number.isSafeInteger(base)
    || !Number.isSafeInteger(count)
    || !Number.isSafeInteger(vertexIndex)
    || vertexIndex < 0
    || vertexIndex >= count
  ) {
    throw new Error("native cloth source normal index is unavailable");
  }
  const normal = loader.globalVertices[base + vertexIndex]?.sourceNorm;
  if (!normal || normal.length < 3 || !normal.every(Number.isFinite)) {
    throw new Error(`native cloth source normal ${base + vertexIndex} is unavailable`);
  }
  return normal;
}

function pairedLatticeNormalSigns(loader, group, topology) {
  if (!group.renderNode || !topology.latticeToRenderVertexMap) return null;
  return Int8Array.from(topology.sourceVertexOrder.map(
    (controlVertex, latticeIndex) => {
      const controlNormal = sourceNormal(
        loader,
        group.controlNode,
        controlVertex,
      );
      const renderNormal = sourceNormal(
        loader,
        group.renderNode,
        topology.latticeToRenderVertexMap[latticeIndex],
      );
      const alignment = controlNormal.reduce(
        (sum, value, axis) => sum + value * renderNormal[axis],
        0,
      ) / (Math.hypot(...controlNormal) * Math.hypot(...renderNormal));
      // The full Shenmue I inventory contains 2,931 paired vertices. Every
      // authored lining normal opposes its exterior partner (worst dot
      // product -0.9313); accepting a same-facing pair would expose a corrupt
      // topology mapping as a lighting or culling artifact at runtime.
      if (alignment > -0.9) {
        throw new Error(
          `native cloth ${group.controlType} lining normal is not opposed`,
        );
      }
      return -1;
    },
  ));
}

function currentRigMatrices(model) {
  const current = model.renderRoot?._mt5CharacterWorldMatrices;
  if (current instanceof Map && current.size > 0) return current;
  return model.loader.characterRigWorldMatrices(
    model.renderRoot,
    model.latestRetargetedRoutes || null,
  );
}

function characterSpace(model) {
  return model.renderRoot?._mt5CharacterContentRoot || model.renderRoot;
}

function transformPoints(points, matrix, characterSpaceMatrix) {
  const rigMatrix = BABYLON.Matrix.FromArray(matrix);
  return points.map((point) => BABYLON.Vector3.TransformCoordinates(
    BABYLON.Vector3.TransformCoordinates(
      BABYLON.Vector3.FromArray(point),
      rigMatrix,
    ),
    characterSpaceMatrix,
  ).asArray());
}

function normalizeDirection(direction, label) {
  const length = direction.length();
  if (!(length > 1e-12)) {
    throw new Error(`${label} is degenerate`);
  }
  return direction.scale(1 / length);
}

function renderMeshesForNode(model, node) {
  return model.renderRoot.getChildMeshes(false).filter(mesh => (
    mesh._mt5NodeAddress === node.addr
    && mesh._mt5SourceVertexIndices?.length === mesh.getTotalVertices()
  ));
}

function validateGeneratedMetadata(group, topology, metadata) {
  if (!metadata) return;
  for (const [name, actual] of [
    ["renderType", group.renderType],
    ["vertexCount", group.vertexCount],
    ["rowCount", topology.rowCount],
    ["columnCount", topology.columnCount],
    ["collisionMask", topology.collisionMask],
  ]) {
    if (metadata[name] !== actual) {
      throw new Error(
        `native cloth generated ${name} ${metadata[name]} does not match ${actual}`,
      );
    }
  }
  for (const [name, actual] of [
    ["sourceVertexOrder", topology.sourceVertexOrder],
    ["anchorBindings", topology.anchorBindings],
    ["anchorSelectors", topology.anchorSelectors],
    ["latticeToRenderVertexMap", topology.latticeToRenderVertexMap],
  ]) {
    if (JSON.stringify(metadata[name]) !== JSON.stringify(actual)) {
      throw new Error(`native cloth generated ${name} does not match the CHRM`);
    }
  }
}

class NativeClothOutputSurface {
  constructor(
    meshes,
    renderNode,
    latticeToRenderVertexMap,
    latticeNormalSigns,
  ) {
    if (meshes.length === 0) {
      throw new Error("native cloth render surface has no Babylon meshes");
    }
    this.meshes = meshes.map((mesh) => {
      const positions = Float32Array.from(mesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      ));
      const normals = Float32Array.from(mesh.getVerticesData(
        BABYLON.VertexBuffer.NormalKind,
      ) || []);
      return Object.freeze({
        mesh,
        skeleton: mesh.skeleton,
        computeBonesUsingShaders: mesh.computeBonesUsingShaders,
        positions,
        normals,
      });
    });
    this.renderVertexBase = renderNode.model.vertexBase;
    this.renderVertexToLattice = new Int16Array(
      latticeToRenderVertexMap.length,
    );
    this.renderVertexToLattice.fill(-1);
    for (
      let latticeIndex = 0;
      latticeIndex < latticeToRenderVertexMap.length;
      latticeIndex += 1
    ) {
      const renderVertex = latticeToRenderVertexMap[latticeIndex];
      if (this.renderVertexToLattice[renderVertex] !== -1) {
        throw new Error(`native cloth render vertex ${renderVertex} is duplicated`);
      }
      this.renderVertexToLattice[renderVertex] = latticeIndex;
    }
    if (this.renderVertexToLattice.some(index => index < 0)) {
      throw new Error("native cloth render mapping is not a permutation");
    }
    if (
      latticeNormalSigns?.length !== latticeToRenderVertexMap.length
      || Array.from(latticeNormalSigns).some(sign => sign !== -1 && sign !== 1)
    ) {
      throw new Error("native cloth normal mapping is invalid");
    }
    this.latticeNormalSigns = Int8Array.from(latticeNormalSigns);
    this.externalSourceVertexIndices = Object.freeze([...new Set(
      this.meshes.flatMap(state => Array.from(
        state.mesh._mt5SourceVertexIndices,
      )).filter(index => (
        index < this.renderVertexBase
        || index >= this.renderVertexBase + this.renderVertexToLattice.length
      )),
    )]);
    this.acquired = false;
  }

  acquire() {
    if (this.acquired) return;
    for (const state of this.meshes) {
      state.mesh.setVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        state.positions,
        true,
        3,
      );
      if (state.normals.length > 0) {
        state.mesh.setVerticesData(
          BABYLON.VertexBuffer.NormalKind,
          state.normals,
          true,
          3,
        );
      }
      // Native CLTH owns final output vertices after the body pose. Detaching
      // this small preserved surface avoids applying its render bone a second
      // time after positions have been solved in character-content space.
      state.mesh.skeleton = null;
      state.mesh.computeBonesUsingShaders = false;
    }
    this.acquired = true;
  }

  write(
    worldPositions,
    worldAuxiliaryEndpoints,
    characterSpaceInverse,
    externalRigPositions,
    externalRigNormals,
  ) {
    if (!this.acquired) throw new Error("native cloth output is not acquired");
    if (worldAuxiliaryEndpoints?.length !== worldPositions.length) {
      throw new Error("native cloth auxiliary output does not match positions");
    }
    const rigPositions = worldPositions.map(point => (
      BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.FromArray(point),
        characterSpaceInverse,
      )
    ));
    const rigAuxiliaryEndpoints = worldAuxiliaryEndpoints.map(point => (
      BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.FromArray(point),
        characterSpaceInverse,
      )
    ));
    for (const state of this.meshes) {
      const positions = Float32Array.from(state.mesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      ));
      const normals = new Float32Array(positions.length);
      for (
        let meshVertex = 0;
        meshVertex < state.mesh._mt5SourceVertexIndices.length;
        meshVertex += 1
      ) {
        const renderVertex = (
          state.mesh._mt5SourceVertexIndices[meshVertex]
          - this.renderVertexBase
        );
        const latticeIndex = this.renderVertexToLattice[renderVertex];
        const point = Number.isInteger(latticeIndex) && latticeIndex >= 0
          ? rigPositions[latticeIndex]
          : externalRigPositions.get(
              state.mesh._mt5SourceVertexIndices[meshVertex],
            );
        const normal = Number.isInteger(latticeIndex) && latticeIndex >= 0
          ? normalizeDirection(
              rigAuxiliaryEndpoints[latticeIndex].subtract(
                rigPositions[latticeIndex],
              ),
              "native cloth simulated normal",
            ).scale(this.latticeNormalSigns[latticeIndex])
          : externalRigNormals.get(
              state.mesh._mt5SourceVertexIndices[meshVertex],
            );
        if (!point || !normal) {
          throw new Error("native cloth boundary vertex owner is unavailable");
        }
        const offset = meshVertex * 3;
        positions[offset] = point.x;
        positions[offset + 1] = point.y;
        positions[offset + 2] = point.z;
        normals[offset] = normal.x;
        normals[offset + 1] = normal.y;
        normals[offset + 2] = normal.z;
      }
      state.mesh.updateVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        positions,
        false,
        false,
      );
      if (state.normals.length === positions.length) {
        state.mesh.updateVerticesData(
          BABYLON.VertexBuffer.NormalKind,
          normals,
          false,
          false,
        );
      }
      state.mesh.refreshBoundingInfo(true);
    }
  }

  release() {
    if (!this.acquired) return;
    for (const state of this.meshes) {
      state.mesh.setVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        state.positions,
        false,
        3,
      );
      if (state.normals.length > 0) {
        state.mesh.setVerticesData(
          BABYLON.VertexBuffer.NormalKind,
          state.normals,
          false,
          3,
        );
      }
      state.mesh.skeleton = state.skeleton;
      state.mesh.computeBonesUsingShaders = state.computeBonesUsingShaders;
      state.mesh.refreshBoundingInfo(true);
    }
    this.acquired = false;
  }
}

class NativeClothGroupState {
  constructor(model, group, metadata, profile, runtimeMode) {
    this.model = model;
    this.group = group;
    this.controlSourcePositions = sourcePositions(
      model.loader,
      group.controlNode,
    );
    this.controlSourceAuxiliaryEndpoints = sourceAuxiliaryEndpoints(
      model.loader,
      group.controlNode,
    );
    this.renderSourcePositions = group.renderNode
      ? sourcePositions(model.loader, group.renderNode)
      : null;
    this.topology = buildNativeClothTopology({
      controlPositions: this.controlSourcePositions,
      renderPositions: this.renderSourcePositions,
      rawControlBytes: profile.rawControlBytes,
      controlType: group.controlType,
    });
    validateGeneratedMetadata(group, this.topology, metadata);
    this.latticeControlPositions = this.topology.sourceVertexOrder.map(
      index => this.controlSourcePositions[index],
    );
    this.latticeControlAuxiliaryEndpoints = this.topology.sourceVertexOrder.map(
      index => this.controlSourceAuxiliaryEndpoints[index],
    );
    this.latticeRenderPositions = this.topology.latticeToRenderVertexMap
      ? this.topology.latticeToRenderVertexMap.map(
          index => this.renderSourcePositions[index],
        )
      : null;
    this.simulation = new NativeClothSimulation({
      restPositions: this.latticeControlPositions,
      restAuxiliaryEndpoints: this.latticeControlAuxiliaryEndpoints,
      topology: this.topology,
      damping: nativeClothVelocityDamping(model.modelCode, runtimeMode),
      closedRingConstraintProfile: nativeClothClosedRingConstraintProfile(
        model.modelCode,
        runtimeMode,
      ),
    });
    const exteriorNormalSigns = new Int8Array(
      this.topology.sourceVertexOrder.length,
    );
    exteriorNormalSigns.fill(1);
    this.exteriorOutput = new NativeClothOutputSurface(
      renderMeshesForNode(model, group.controlNode),
      group.controlNode,
      this.topology.sourceVertexOrder,
      exteriorNormalSigns,
    );
    this.liningOutput = group.renderNode
      ? new NativeClothOutputSurface(
          renderMeshesForNode(model, group.renderNode),
          group.renderNode,
          this.topology.latticeToRenderVertexMap,
          pairedLatticeNormalSigns(model.loader, group, this.topology),
        )
      : null;
    this.outputs = Object.freeze([
      this.exteriorOutput,
      ...(this.liningOutput ? [this.liningOutput] : []),
    ]);
  }

  acquire() {
    this.simulation.clear();
    for (const output of this.outputs) output.acquire();
  }

  update(
    deltaSeconds,
    rigMatrices,
    matricesByType,
    spaceMatrix,
    inverseSpaceMatrix,
    colliders,
    minimumBodyCollisionRadius,
    runtimeMode,
    runtimeSeconds,
    capturedFrame = null,
  ) {
    const controlMatrix = rigMatrices.get(this.group.controlNode.addr);
    const renderMatrix = this.group.renderNode
      ? rigMatrices.get(this.group.renderNode.addr)
      : null;
    if (!controlMatrix || (this.group.renderNode && !renderMatrix)) {
      throw new Error("native cloth animated surface matrices are unavailable");
    }
    const controlBase = transformPoints(
      this.latticeControlPositions,
      controlMatrix,
      spaceMatrix,
    );
    const controlBaseAuxiliary = transformPoints(
      this.latticeControlAuxiliaryEndpoints,
      controlMatrix,
      spaceMatrix,
    );
    const renderBase = this.latticeRenderPositions
      ? transformPoints(
          this.latticeRenderPositions,
          renderMatrix,
          spaceMatrix,
        )
      : null;
    let solved;
    let solvedAuxiliary;
    if (capturedFrame) {
      if (capturedFrame.length !== this.group.vertexCount * 6) {
        throw new Error("native captured cloth frame has the wrong vertex count");
      }
      // Flycast captures the native state array in original CHRM source order.
      // The browser simulation/output path is lattice ordered, so retain the
      // exact topology permutation recovered from the model instead of
      // assuming the source happens to be row-major.
      const localPositions = this.topology.sourceVertexOrder.map(sourceIndex => (
        Array.from(capturedFrame.subarray(sourceIndex * 6, sourceIndex * 6 + 3))
      ));
      const localAuxiliary = this.topology.sourceVertexOrder.map(sourceIndex => (
        Array.from(capturedFrame.subarray(sourceIndex * 6 + 3, sourceIndex * 6 + 6))
      ));
      // The retained native boundary is immediately after CLTH converts its
      // state back to control-node local space. Apply the current authored
      // body pose and actor world transform just as the native render-pair
      // projection does; this keeps the captured billow attached to whatever
      // AUTH transform is active in the browser.
      solved = transformPoints(localPositions, controlMatrix, spaceMatrix);
      solvedAuxiliary = transformPoints(
        localAuxiliary,
        controlMatrix,
        spaceMatrix,
      );
    } else {
      const rowForces = buildNativeClothRowForces({
        modelCode: this.model.modelCode,
        controlType: this.group.controlType,
        rowCount: this.topology.rowCount,
        matricesByType,
        characterSpaceMatrix: spaceMatrix,
        runtimeMode,
      });
      if (!rowForces) return false;
      const pointAdvections = buildNativeClothPointAdvections({
        runtimeMode,
        rowCount: this.topology.rowCount,
        columnCount: this.topology.columnCount,
        elapsedSeconds: runtimeSeconds,
        characterSpaceMatrix: spaceMatrix,
      });
      const simulationResult = this.simulation.advance(deltaSeconds, {
        basePositions: controlBase,
        baseAuxiliaryEndpoints: controlBaseAuxiliary,
        rowForces,
        pointAdvections,
        colliders,
        minimumBodyCollisionRadius,
      });
      // CLTH produces a new garment surface only on its native 30 Hz tick.
      // Rewriting an older world-space solution through a newer actor transform
      // on an accumulator-only render frame counter-translates the garment in
      // model space: it appears to remain in the world for one frame, then snap
      // back to its owner on the next native tick. Keep the existing local
      // output buffers between ticks so the actor hierarchy carries the whole
      // garment coherently. A reset still needs its initial surface write.
      if (simulationResult.steps === 0 && !simulationResult.reset) return false;
      solved = simulationResult.positions;
      solvedAuxiliary = simulationResult.auxiliaryEndpoints;
    }
    const liningPositions = renderBase?.map((point, index) => [
      point[0] + solved[index][0] - controlBase[index][0],
      point[1] + solved[index][1] - controlBase[index][1],
      point[2] + solved[index][2] - controlBase[index][2],
    ]) || null;
    const liningAuxiliary = liningPositions?.map((point, index) => [
      point[0] + solvedAuxiliary[index][0] - solved[index][0],
      point[1] + solvedAuxiliary[index][1] - solved[index][1],
      point[2] + solvedAuxiliary[index][2] - solved[index][2],
    ]) || null;
    const externalRigPositions = new Map();
    const externalRigNormals = new Map();
    const externalSourceVertexIndices = new Set(this.outputs.flatMap(
      surface => surface.externalSourceVertexIndices,
    ));
    for (const sourceIndex of externalSourceVertexIndices) {
      const owner = this.model.renderRoot._mt5Nodes.find(node => (
        Number.isSafeInteger(node.model?.vertexBase)
        && sourceIndex >= node.model.vertexBase
        && sourceIndex < node.model.vertexBase + node.model.nbVertex
      ));
      const ownerMatrix = owner && rigMatrices.get(owner.addr);
      const sourceVertex = this.model.loader.globalVertices[sourceIndex];
      const source = sourceVertex?.sourcePos;
      const sourceNormal = sourceVertex?.sourceNorm;
      if (!ownerMatrix || !source || !sourceNormal) continue;
      const matrix = BABYLON.Matrix.FromArray(ownerMatrix);
      const point = BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.FromArray(source),
        matrix,
      );
      const endpoint = BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.FromArray(source.map(
          (value, axis) => value + sourceNormal[axis],
        )),
        matrix,
      );
      externalRigPositions.set(
        sourceIndex,
        point,
      );
      externalRigNormals.set(
        sourceIndex,
        normalizeDirection(
          endpoint.subtract(point),
          "native cloth boundary normal",
        ),
      );
    }
    this.exteriorOutput.write(
      solved,
      solvedAuxiliary,
      inverseSpaceMatrix,
      externalRigPositions,
      externalRigNormals,
    );
    if (this.liningOutput) {
      this.liningOutput.write(
        liningPositions,
        liningAuxiliary,
        inverseSpaceMatrix,
        externalRigPositions,
        externalRigNormals,
      );
    }
    return true;
  }

  release() {
    for (const output of this.outputs) output.release();
    this.simulation.clear();
  }
}

export class NativeClothModelState {
  constructor(model) {
    if (!model?.loader || !model?.renderRoot) {
      throw new TypeError("native cloth model state requires a loaded MT5 model");
    }
    this.model = model;
    const groups = discoverNativeClothGroups(model.renderRoot).filter(
      group => group.controlNode.mesh?.isEnabled?.() !== false,
    );
    const profile = nativeClothCharacterProfile(model.modelCode);
    this.runtimeMode = Number.isSafeInteger(model.nativeClothRuntimeMode)
      ? model.nativeClothRuntimeMode
      : 0;
    const metadataByType = new Map(
      (NATIVE_CLOTH_MODEL_METADATA[modelMetadataKey(model.modelCode)] || [])
        .map(entry => [entry.controlType, entry]),
    );
    this.groups = groups.map(group => new NativeClothGroupState(
      model,
      group,
      metadataByType.get(group.controlType) || null,
      profile,
      this.runtimeMode,
    ));
    this.acquired = false;
    this.presentationOwner = null;
    this.runtimeSeconds = 0;
    this.capturedTrack = null;
    this.capturedActivitySlot = null;
  }

  get active() {
    return this.groups.length > 0;
  }

  acquire() {
    if (this.acquired) return;
    prepareNativeClothModelSurfaces(this.model.renderRoot);
    for (const group of this.groups) group.acquire();
    this.acquired = true;
  }

  reset() {
    // Captured frames are written directly into model-owned output meshes.
    // Restore those meshes to their authored geometry at a transport/program
    // reset so a second run cannot begin with the prior run's terminal skirt
    // pose while waiting for its first captured AUTH coordinate.
    if (this.acquired) {
      for (const group of this.groups) group.release();
      this.acquired = false;
    } else {
      for (const group of this.groups) group.simulation.clear();
    }
    this.runtimeSeconds = 0;
    this.capturedTrack = null;
    this.capturedActivitySlot = null;
  }

  beginPresentation(owner, {
    capturedTrack = null,
    activitySlot = null,
  } = {}) {
    if (owner == null) {
      throw new TypeError("native cloth presentation owner is required");
    }
    if (this.presentationOwner !== null) {
      return this.presentationOwner === owner;
    }
    this.acquire();
    if (capturedTrack && !this.groups.some(group => capturedTrack.matches(group.group))) {
      throw new Error("native cloth track does not match the loaded model");
    }
    if (this.capturedTrack && capturedTrack !== this.capturedTrack) {
      throw new Error("native cloth track changed within one presentation epoch");
    }
    this.capturedTrack = capturedTrack;
    if (capturedTrack && !Number.isSafeInteger(activitySlot)) {
      throw new Error("native cloth track requires an AUTH activity slot");
    }
    this.capturedActivitySlot = capturedTrack ? activitySlot : null;
    this.presentationOwner = owner;
    return true;
  }

  endPresentation(owner, { preserveState = false } = {}) {
    if (this.presentationOwner !== owner) return false;
    this.presentationOwner = null;
    if (!preserveState) this.reset();
    return true;
  }

  update(
    deltaSeconds = NATIVE_FRAME_SECONDS,
    owner = null,
    { activityFrame = null } = {},
  ) {
    // Scheduled/gameplay animation and AUTH cutscenes share the same loaded
    // model state. Once AUTH claims the surface, only that presentation may
    // advance the native 30 Hz solver; otherwise the scheduled pass and AUTH
    // pass each step it once in the same render frame.
    if (
      this.presentationOwner !== null
      && this.presentationOwner !== owner
    ) return false;
    if (!this.acquired) this.acquire();
    const rigMatrices = currentRigMatrices(this.model);
    const space = characterSpace(this.model);
    const spaceMatrix = space.computeWorldMatrix(true).clone();
    const inverseSpaceMatrix = BABYLON.Matrix.Invert(spaceMatrix);
    const simulatedGroups = this.groups.filter(group => (
      !this.capturedTrack?.matches(group.group)
    ));
    const matricesByType = simulatedGroups.length > 0
      ? nativeClothControllerMatricesByType(
          this.model.latestControllerFamily,
          this.model.latestControllerMatrices,
        )
      : null;
    const colliders = simulatedGroups.length > 0
      ? buildNativeClothBodyColliders({
          modelCode: this.model.modelCode,
          controllerFamily: this.model.latestControllerFamily,
          controllerMatrices: this.model.latestControllerMatrices,
          characterSpaceMatrix: spaceMatrix,
          runtimeMode: this.runtimeMode,
        })
      : [];
    const collisionProfile = simulatedGroups.length > 0
      ? nativeClothBodyCollisionProfile(this.model.modelCode, this.runtimeMode)
      : null;
    if (
      simulatedGroups.length > 0
      && (
        !matricesByType
        || colliders.length !== collisionProfile.records.length
      )
    ) return false;
    const minimumBodyCollisionRadius = colliders.length > 0
      ? Math.min(...colliders.map(collider => collider.radius))
      : 0;
    this.runtimeSeconds += deltaSeconds;
    let updated = false;
    for (const group of this.groups) {
      const usesCapturedTrack = this.capturedTrack?.matches(group.group) === true;
      const capturedFrame = usesCapturedTrack
        ? this.capturedTrack.frameAt(
            this.capturedActivitySlot,
            activityFrame,
          )
        : null;
      // Before the first captured mutation, or during an AUTH interval where
      // native CLTH is intentionally idle, retain the existing model-local
      // output. Do not silently re-enter the procedural wind solver.
      if (usesCapturedTrack && capturedFrame === null) continue;
      updated = group.update(
        deltaSeconds,
        rigMatrices,
        matricesByType,
        spaceMatrix,
        inverseSpaceMatrix,
        colliders,
        minimumBodyCollisionRadius,
        this.runtimeMode,
        this.runtimeSeconds,
        capturedFrame,
      ) || updated;
    }
    return updated;
  }

  release() {
    if (this.acquired) {
      for (const group of this.groups) group.release();
    }
    this.presentationOwner = null;
    this.acquired = false;
    this.runtimeSeconds = 0;
    this.capturedTrack = null;
    this.capturedActivitySlot = null;
  }
}

export function nativeClothStateForModel(model) {
  if (!model || (typeof model !== "object" && typeof model !== "function")) {
    throw new TypeError("native cloth state requires a model object");
  }
  let state = MODEL_STATES.get(model);
  if (!state) {
    state = new NativeClothModelState(model);
    MODEL_STATES.set(model, state);
  }
  return state;
}

export class NativeClothPresentation {
  constructor({ actors, definitions = null, loadAsset = null } = {}) {
    if (typeof actors?.activeActor !== "function") {
      throw new TypeError("native cloth presentation requires actor resolution");
    }
    this.actors = actors;
    this.definitions = new Map(Object.entries(definitions || {}));
    this.loadAsset = loadAsset;
    if (this.definitions.size > 0 && typeof loadAsset !== "function") {
      throw new TypeError("native cloth tracks require asset loading");
    }
    this.preparedTracks = new Map();
    this.modelStates = new WeakMap();
    this.states = new Set();
    this.active = null;
  }

  async prepare({ actors: actorTags = [] } = {}) {
    await Promise.all(actorTags.map(async actorTag => {
      const definition = this.definitions.get(actorTag);
      if (!definition || this.preparedTracks.has(actorTag)) return;
      const track = parseNativeClothTrack(await this.loadAsset(definition.path));
      const firstCoordinate = track.coordinates[0];
      const lastCoordinate = track.coordinates[track.coordinates.length - 1];
      if (
        definition.controlType !== track.controlType
        || (definition.modelCode && !String(definition.modelCode).startsWith(track.modelCode))
        || (Number.isSafeInteger(definition.frameCount)
          && definition.frameCount !== track.frameCount)
        || (definition.firstCoordinate
          && (definition.firstCoordinate[0] !== firstCoordinate.slot
            || definition.firstCoordinate[1] !== firstCoordinate.frame))
        || (definition.lastCoordinate
          && (definition.lastCoordinate[0] !== lastCoordinate.slot
            || definition.lastCoordinate[1] !== lastCoordinate.frame))
        || (definition.activityOrder
          && JSON.stringify(definition.activityOrder)
            !== JSON.stringify(track.activityOrder))
      ) {
        throw new Error(`native cloth track ${actorTag} metadata does not match`);
      }
      this.preparedTracks.set(actorTag, track);
    }));
    return true;
  }

  reset() {
    if (this.active) return false;
    for (const state of this.states) state.reset();
    this.modelStates = new WeakMap();
    this.states = new Set();
    return true;
  }

  begin(owner, actorTags, { slot = null } = {}) {
    if (this.active) throw new Error("native cloth is already owned");
    const states = [];
    try {
      const requestedModels = new Map();
      for (const actorTag of actorTags) {
        const model = this.actors.activeActor(actorTag)?.model;
        if (
          !model?.loader
          || !model?.renderRoot
          || model.characterAssetFormat === "MT7"
        ) continue;
        const capturedTrack = this.preparedTracks.get(actorTag) || null;
        const requested = requestedModels.get(model);
        if (!requested) {
          requestedModels.set(model, { model, capturedTrack });
        } else if (
          capturedTrack
          && requested.capturedTrack
          && capturedTrack !== requested.capturedTrack
        ) {
          throw new Error("one native cloth model has conflicting captured tracks");
        } else if (capturedTrack) {
          requested.capturedTrack = capturedTrack;
        }
      }
      for (const { model, capturedTrack } of requestedModels.values()) {
        let state = this.modelStates.get(model);
        if (!state) {
          state = nativeClothStateForModel(model);
          this.modelStates.set(model, state);
          this.states.add(state);
        }
        if (state.active && !states.includes(state)) {
          if (!state.beginPresentation(owner, {
            capturedTrack,
            activitySlot: slot,
          })) {
            throw new Error(
              "native cloth model is owned by another presentation",
            );
          }
          states.push(state);
        }
      }
    } catch (error) {
      for (const state of states) state.endPresentation(owner);
      throw error;
    }
    this.active = { owner, states };
    return true;
  }

  apply(owner, { frame = null } = {}) {
    if (this.active?.owner !== owner) return false;
    for (const state of this.active.states) {
      state.update(NATIVE_FRAME_SECONDS, owner, { activityFrame: frame });
    }
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    const states = this.active.states;
    this.active = null;
    // The output surface is model-owned, not cutscene-owned. Keep it acquired
    // so normal scheduled presentation resumes without a rigid one-frame pop.
    // Nested AUTH activities are camera-shot subleases, not independent native
    // cloth simulations. Preserve the program-owned solver state at their
    // boundary; program start and transport reset establish a deterministic
    // new presentation epoch.
    for (const state of states) state.endPresentation(owner, {
      preserveState: true,
    });
    return true;
  }
}

export function createNativeClothPresentation(options) {
  return new NativeClothPresentation(options);
}
