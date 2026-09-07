import * as BABYLON from "@babylonjs/core";
import {
  detailedSurfaceCoverage,
  integrateDetailedSurface,
  restoreDetailedSurface,
} from "./NativeSurfaceOwnership.js";

// MT5 character units are metres. Three millimetres separates all five pinned
// OP00 FACE surfaces from their body-only neck geometry.
const MAX_SURFACE_SEPARATION = 0.003;

function textureSurfaceKind(textureId) {
  const normalized = String(textureId || "").toLowerCase();
  return /^[0-9a-f]{16}$/.test(normalized)
    ? normalized.slice(8)
    : normalized;
}

function texturesDescribeSameSurface(first, second) {
  if (!first || !second) return false;
  return first === second
    || textureSurfaceKind(first) === textureSurfaceKind(second);
}

function replaceVertexBuffer(mesh, kind, values) {
  const buffer = mesh.getVertexBuffer(kind);
  if (buffer?.isUpdatable?.()) {
    mesh.updateVerticesData(kind, values, false, false);
  } else {
    mesh.setVerticesData(kind, values, false);
  }
}

/**
 * Resolve signed FACE indices against the source parent of the body attachment
 * that the detailed node replaces. Native *_F.MT5 resources are standalone
 * files, but their root strips retain the same negative indices as the body's
 * low-detail FACE node. In an in-file MT5 hierarchy those indices borrow the
 * tail of that node's parent vertex array, then transform the borrowed vertex
 * into attachment-local space. The loader preserves the unresolved offsets
 * until the separate body and detailed resources meet here.
 */
export function bindBodyFaceParentVertices({
  bodyModelRoot,
  bodyFaceNode,
  bodyLoader,
  faceAttachmentNode,
  faceLoader,
}) {
  const bodyParentNode = bodyModelRoot?._mt5Nodes?.find(
    node => node.addr === bodyFaceNode?.parentAddr,
  );
  const bodyParentModel = bodyParentNode?.model;
  const faceMeshes = faceAttachmentNode?.mesh?.getChildMeshes?.(false) || [];
  const inverseBodyAttachmentLocal = bodyFaceNode
    ? bodyLoader?.constructor?.inverseSourceTransformMatrix?.(
        bodyFaceNode,
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
    throw new Error("native FACE parent vertex binding is unavailable");
  }

  let boundVertexCount = 0;
  for (const mesh of faceMeshes) {
    const externalOffsets = mesh._mt5ExternalParentVertexOffsets;
    if (!externalOffsets) continue;
    if (externalOffsets.length !== mesh.getTotalVertices()) {
      throw new Error("native FACE parent vertex metadata is inconsistent");
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
      throw new Error("native FACE parent vertex buffers are inconsistent");
    }
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
          `native FACE parent vertex ${relativeIndex} is unavailable`,
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
          `native FACE parent vertex ${relativeIndex} has no normal`,
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
      boundVertexCount += 1;
    }
    replaceVertexBuffer(mesh, BABYLON.VertexBuffer.PositionKind, positions);
    replaceVertexBuffer(mesh, BABYLON.VertexBuffer.NormalKind, normals);
    if (faceLoader.orientTriangleWindingToNormals) {
      faceLoader.constructor.orientMeshTriangleWindingToNormals(mesh);
    }
    mesh.refreshBoundingInfo();
  }
  return boundVertexCount;
}

/**
 * Build the exact attachment-space surface supplied by a native *_F.MT5.
 */
export function faceSurfaceCoverage({
  faceRoot,
  faceLoader,
  faceAttachmentNode,
}) {
  return detailedSurfaceCoverage({
    detailedRoot: faceRoot,
    detailedLoader: faceLoader,
    detailedAttachmentNode: faceAttachmentNode,
  });
}

/**
 * Suppress only complete body triangles replaced by the separate FACE
 * resource. A coarse body triangle crossing the face/neck boundary remains
 * body-owned so its authored neckward portion is never discarded.
 */
export function integrateBodyFaceSurface({
  bodyModelRoot,
  bodyFaceNode,
  bodyLoader,
  faceRoot,
  faceAttachmentNode,
  faceEyeNodes = [],
  faceLoader,
}) {
  const boundExternalParentVertexCount = bindBodyFaceParentVertices({
    bodyModelRoot,
    bodyFaceNode,
    bodyLoader,
    faceAttachmentNode,
    faceLoader,
  });
  const eyeNodeAddresses = new Set(
    faceEyeNodes.filter(Boolean).map(node => node.addr),
  );
  const integration = integrateDetailedSurface({
    bodyModelRoot,
    bodyAttachmentNode: bodyFaceNode,
    bodyLoader,
    detailedRoot: faceRoot,
    detailedAttachmentNode: faceAttachmentNode,
    detailedLoader: faceLoader,
    surfacesMatch: texturesDescribeSameSurface,
    // The primary FACE shell has a neck attachment seam, so its coarse body
    // triangles transfer only when all three corners are covered. Eye inserts
    // have no such seam. Any low-detail body-eye triangle sharing their exact
    // surface must transfer completely or the two eye models depth-fight as
    // the head turns.
    priorityDetailedMeshFilter: eyeNodeAddresses.size > 0
      ? mesh => eyeNodeAddresses.has(mesh._mt5NodeAddress)
      : null,
    // A FACE resource without signed parent references has no authored proof
    // that its shell closes the body seam. Preserve two body-topology rings
    // around the replacement boundary so neck and jaw transitions remain
    // continuous without actor-specific coordinate cuts.
    replacementBoundaryRings: boundExternalParentVertexCount > 0 ? 0 : 2,
    // Signed parent references are explicit authored proof that this FACE
    // shell closes on the body attachment boundary. In that case complete
    // replacement is valid: the detailed shell now owns the borrowed seam
    // positions. Without those references, retain the generic safety guard.
    allowCompleteReplacement: boundExternalParentVertexCount > 0,
    maximumSeparation: MAX_SURFACE_SEPARATION,
    label: "native FACE resource",
  });
  return Object.freeze({
    ...integration,
    boundExternalParentVertexCount,
  });
}

export function restoreBodyFaceSurface(integration) {
  return restoreDetailedSurface(integration);
}
