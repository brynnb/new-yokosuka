import { bindBodyAttachmentParentVertices } from "./NativeAttachmentSeam.js";
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
 * A signed-parent FACE shell owns matching surfaces on the body FACE node
 * and its native -68 mouth patch. Other descendants still need geometric
 * coverage: hair overlays can share the skin atlas. Without signed references,
 * geometric ownership considers the whole mounted resource, including neck
 * geometry above the animated FACE node.
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
  const seamBindings = new Map();
  const boundExternalParentVertexCount = bindBodyAttachmentParentVertices({
    bodyModelRoot,
    bodyAttachmentNode: bodyFaceNode,
    bodyLoader,
    detailedAttachmentNode: faceAttachmentNode,
    detailedLoader: faceLoader,
    seamBindings,
  });
  const eyeNodeAddresses = new Set(
    faceEyeNodes.filter(Boolean).map(node => node.addr),
  );
  const bodyNodesByAddress = new Map(
    (bodyModelRoot?._mt5Nodes || []).map(node => [node.addr, node]),
  );
  const integration = integrateDetailedSurface({
    bodyModelRoot,
    bodyAttachmentNode: bodyFaceNode,
    bodyLoader,
    detailedRoot: faceRoot,
    detailedAttachmentNode: faceAttachmentNode,
    detailedLoader: faceLoader,
    surfacesMatch: texturesDescribeSameSurface,
    // Signed references bind the replacement shell to the body's actual
    // parent seam. Testing every coarse triangle against a 3mm/normal gate
    // instead leaves old skin and mouth polygons poking through detailed
    // faces (especially low-detail bodies). -68 is the native generic mouth
    // destination, also resolved by GenericFaceMorph. Do not extend this to
    // arbitrary descendants: Ryo has hair cards using the same skin atlas.
    completeReplacementMeshFilter: boundExternalParentVertexCount > 0
      ? mesh => {
          const node = bodyNodesByAddress.get(mesh._mt5NodeAddress);
          return node?.addr === bodyFaceNode.addr
            || (node && ((node.flag << 16) >> 16) === -0x44);
        }
      : null,
    // For surfaces without complete authored replacement, ordinary triangles
    // still need all three corners covered. Eye inserts have no neck seam:
    // any overlapping low-detail eye triangle transfers completely or the
    // two eye models depth-fight as the head turns.
    priorityDetailedMeshFilter: eyeNodeAddresses.size > 0
      ? mesh => eyeNodeAddresses.has(mesh._mt5NodeAddress)
      : null,
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
    seamBindings,
  });
}

export function restoreBodyFaceSurface(integration) {
  integration?.seamBindings.clear();
  return restoreDetailedSurface(integration);
}
