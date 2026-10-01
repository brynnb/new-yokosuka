import * as BABYLON from "@babylonjs/core";

function replaceVertexBuffer(mesh, kind, values) {
  const buffer = mesh.getVertexBuffer(kind);
  if (buffer?.isUpdatable?.()) {
    mesh.updateVerticesData(kind, values, false, false);
  } else {
    mesh.setVerticesData(kind, values, false);
  }
}

/**
 * Resolve signed attachment indices against the source parent of the body attachment
 * that the detailed node replaces. Native detailed MT5 resources are standalone
 * files, but their root strips retain the same negative indices as the body's
 * low-detail attachment node. In an in-file MT5 hierarchy those indices borrow the
 * tail of that node's parent vertex array, then transform the borrowed vertex
 * into attachment-local space. The loader preserves the unresolved offsets
 * until the separate body and detailed resources meet here.
 */
export function bindBodyAttachmentParentVertices({
  bodyModelRoot,
  bodyAttachmentNode,
  bodyLoader,
  detailedAttachmentNode,
  detailedLoader,
  seamBindings = null,
}) {
  const bodyParentNode = bodyModelRoot?._mt5Nodes?.find(
    node => node.addr === bodyAttachmentNode?.parentAddr,
  );
  const bodyParentModel = bodyParentNode?.model;
  const detailedMeshes = detailedAttachmentNode?.mesh?.getChildMeshes?.(false) || [];
  const inverseBodyAttachmentLocal = bodyAttachmentNode
    ? bodyLoader?.constructor?.inverseSourceTransformMatrix?.(
        bodyAttachmentNode,
      )
    : null;
  if (
    !bodyParentModel
    || !Number.isInteger(bodyParentModel.vertexBase)
    || !Number.isInteger(bodyParentModel.nbVertex)
    || bodyParentModel.nbVertex <= 0
    || !Array.isArray(bodyLoader?.globalVertices)
    || !inverseBodyAttachmentLocal
  ) {
    throw new Error("native attachment parent vertex binding is unavailable");
  }

  // Detailed strips can borrow parent vertices that the coarse attachment
  // never used (HIHY Iwao is one example). Resolve those on the actual parent,
  // including its batched GPU mesh. Prefer an attachment's existing welded
  // seam copy when present; neither route guesses by spatial proximity.
  const bodyVertices = new Map();
  if (seamBindings) {
    const bodyMeshes = bodyModelRoot._mt5CharacterGpuRig?.skinnedMeshes
      || bodyModelRoot.getChildMeshes(false);
    for (const mesh of bodyMeshes) {
      mesh._mt5SourceVertexIndices?.forEach((sourceIndex, vertexIndex) => {
        const nodeAddress = mesh._mt5SourceNodeAddresses?.[vertexIndex] ?? mesh._mt5NodeAddress;
        if (nodeAddress === bodyParentNode.addr) {
          bodyVertices.set(sourceIndex, { mesh, vertexIndex });
        }
      });
    }
    for (const mesh of bodyAttachmentNode.mesh.getChildMeshes(false)) {
      if (mesh._mt5NodeAddress !== bodyAttachmentNode.addr) continue;
      mesh._mt5SourceVertexIndices?.forEach((sourceIndex, vertexIndex) => {
        bodyVertices.set(sourceIndex, { mesh, vertexIndex });
      });
    }
  }
  let boundVertexCount = 0;
  for (const mesh of detailedMeshes) {
    const externalOffsets = mesh._mt5ExternalParentVertexOffsets;
    if (!externalOffsets) continue;
    if (externalOffsets.length !== mesh.getTotalVertices()) {
      throw new Error("native attachment parent vertex metadata is inconsistent");
    }
    const positions = Float32Array.from(mesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));
    const normals = Float32Array.from(mesh.getVerticesData(
      BABYLON.VertexBuffer.NormalKind,
    ));
    if (
      positions.length !== externalOffsets.length * 3
      || normals.length !== positions.length
      || mesh._mt5SourcePositions?.length !== positions.length
      || mesh._mt5SourceNormals?.length !== positions.length
    ) {
      throw new Error("native attachment parent vertex buffers are inconsistent");
    }
    const groups = new Map();
    for (let vertexIndex = 0; vertexIndex < externalOffsets.length; vertexIndex += 1) {
      const relativeIndex = externalOffsets[vertexIndex];
      if (relativeIndex >= 0) continue;
      const bodyParentLocalIndex = bodyParentModel.nbVertex + relativeIndex;
      const bodyParentVertex = bodyLoader.globalVertices[
        bodyParentModel.vertexBase + bodyParentLocalIndex
      ];
      if (
        bodyParentLocalIndex < 0
        || bodyParentLocalIndex >= bodyParentModel.nbVertex
        || !bodyParentVertex?.sourcePos
        || !bodyParentVertex?.sourceNorm
      ) {
        throw new Error(
          `native attachment parent vertex ${relativeIndex} is unavailable`,
        );
      }
      const sourcePosition = bodyLoader.constructor.transformRowPoint(
        bodyParentVertex.sourcePos,
        inverseBodyAttachmentLocal,
      );
      const unnormalizedNormal = bodyLoader.constructor.transformRowVector(
        bodyParentVertex.sourceNorm,
        inverseBodyAttachmentLocal,
      );
      const normalLength = Math.hypot(...unnormalizedNormal);
      if (normalLength <= 1e-12) {
        throw new Error(
          `native attachment parent vertex ${relativeIndex} has no normal`,
        );
      }
      const sourceNormal = unnormalizedNormal.map(
        value => value / normalLength,
      );
      const offset = vertexIndex * 3;
      positions.set(sourcePosition, offset);
      normals.set(sourceNormal, offset);
      mesh._mt5SourcePositions.splice(offset, 3, ...sourcePosition);
      mesh._mt5SourceNormals.splice(offset, 3, ...sourceNormal);
      if (seamBindings) {
        const sourceIndex = bodyParentModel.vertexBase + bodyParentLocalIndex;
        const bodyVertex = bodyVertices.get(sourceIndex);
        if (!bodyVertex) {
          throw new Error(`native attachment seam source vertex ${sourceIndex} is unavailable on body node ${bodyAttachmentNode.addr}`);
        }
        const pairs = groups.get(bodyVertex.mesh) || [];
        pairs.push({ detailedIndex: vertexIndex, bodyIndex: bodyVertex.vertexIndex });
        groups.set(bodyVertex.mesh, pairs);
      }
      boundVertexCount += 1;
    }
    if (groups.size) {
      seamBindings.set(mesh, {
        groups,
        skin: BABYLON.Matrix.Identity(),
        inverseSkin: BABYLON.Matrix.Identity(),
        inverseWorld: BABYLON.Matrix.Identity(),
        bodyToDetailed: BABYLON.Matrix.Identity(),
        position: BABYLON.Vector3.Zero(),
      });
    }
    replaceVertexBuffer(mesh, BABYLON.VertexBuffer.PositionKind, positions);
    replaceVertexBuffer(mesh, BABYLON.VertexBuffer.NormalKind, normals);
    if (detailedLoader.orientTriangleWindingToNormals) {
      detailedLoader.constructor.orientMeshTriangleWindingToNormals(mesh);
    }
    mesh.refreshBoundingInfo();
  }
  return boundVertexCount;
}

function vertexSkinMatrix(mesh, index, matrices, result) {
  if (!matrices) {
    BABYLON.Matrix.IdentityToRef(result);
    return;
  }
  const indices = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind);
  const weights = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind);
  result.reset();
  for (let influence = 0; influence < mesh.numBoneInfluencers; influence += 1) {
    const weight = weights[index * 4 + influence];
    if (!weight) continue;
    const offset = indices[index * 4 + influence] * 16;
    for (let element = 0; element < 16; element += 1) {
      result.m[element] += matrices[offset + element] * weight;
    }
  }
  result.markAsUpdated();
}

/**
 * Write only signed seam vertices into the existing attachment morph output. Body
 * welding can blend adjacent bones while the standalone attachment follows one
 * bone. Copying bind positions alone therefore opens a gap during animation.
 * Evaluate the body's actual skin weights, then undo the attachment skin transform
 * so its GPU shader lands on exactly the same animated point. This does not
 * CPU-skin either whole mesh or alter normals, UVs, skeletons, or morphs.
 */
export function applyBodyAttachmentSeam(integration, mesh, output) {
  const binding = integration?.seamBindings.get(mesh);
  if (!binding) return;
  const { groups, skin, inverseSkin, inverseWorld, bodyToDetailed, position } = binding;
  mesh.computeWorldMatrix(true).invertToRef(inverseWorld);
  // Native simulation may install several poses under one Babylon render ID.
  // getTransformMatrices alone can return a previous pose even when dirty;
  // bypass only that frame-ID guard, not the skeleton's own dirty check.
  mesh.skeleton?.prepare(true);
  const detailedMatrices = mesh.skeleton?.getTransformMatrices(mesh);
  for (const [bodyMesh, pairs] of groups) {
    bodyMesh.computeWorldMatrix(true).multiplyToRef(inverseWorld, bodyToDetailed);
    bodyMesh.skeleton?.prepare(true);
    const bodyMatrices = bodyMesh.skeleton?.getTransformMatrices(bodyMesh);
    const bodyPositions = bodyMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for (const { detailedIndex, bodyIndex } of pairs) {
      BABYLON.Vector3.FromArrayToRef(bodyPositions, bodyIndex * 3, position);
      vertexSkinMatrix(bodyMesh, bodyIndex, bodyMatrices, skin);
      BABYLON.Vector3.TransformCoordinatesToRef(position, skin, position);
      BABYLON.Vector3.TransformCoordinatesToRef(position, bodyToDetailed, position);
      vertexSkinMatrix(mesh, detailedIndex, detailedMatrices, skin);
      skin.invertToRef(inverseSkin);
      BABYLON.Vector3.TransformCoordinatesToRef(position, inverseSkin, position);
      position.toArray(output, detailedIndex * 3);
    }
  }
}
