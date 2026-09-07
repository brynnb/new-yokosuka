import * as BABYLON from "@babylonjs/core";

function attachmentSpaceMatrix(loader, modelRoot, mesh, attachmentNode) {
  const node = (modelRoot?._mt5Nodes || []).find(
    candidate => candidate.addr === mesh._mt5NodeAddress,
  );
  if (!node || !attachmentNode) return null;
  return loader.constructor.rowMultiply(
    loader.sourceWorldMatrixForNode(node),
    loader.constructor.inverseAffineRow(
      loader.sourceWorldMatrixForNode(attachmentNode),
    ),
  );
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function dot(left, right) {
  return left.reduce(
    (total, value, index) => total + value * right[index],
    0,
  );
}

function addScaled(origin, direction, scale) {
  return origin.map((value, index) => value + direction[index] * scale);
}

function pointDistance(left, right) {
  return Math.hypot(...subtract(left, right));
}

// Closest-point regions from Real-Time Collision Detection.
function pointTriangleDistance(point, [first, second, third]) {
  const firstSecond = subtract(second, first);
  const firstThird = subtract(third, first);
  const firstPoint = subtract(point, first);
  const firstDot = dot(firstSecond, firstPoint);
  const secondDot = dot(firstThird, firstPoint);
  if (firstDot <= 0 && secondDot <= 0) return pointDistance(point, first);

  const secondPoint = subtract(point, second);
  const thirdDot = dot(firstSecond, secondPoint);
  const fourthDot = dot(firstThird, secondPoint);
  if (thirdDot >= 0 && fourthDot <= thirdDot) {
    return pointDistance(point, second);
  }

  const firstEdgeRegion = firstDot * fourthDot - thirdDot * secondDot;
  if (firstEdgeRegion <= 0 && firstDot >= 0 && thirdDot <= 0) {
    const weight = firstDot / (firstDot - thirdDot);
    return pointDistance(point, addScaled(first, firstSecond, weight));
  }

  const thirdPoint = subtract(point, third);
  const fifthDot = dot(firstSecond, thirdPoint);
  const sixthDot = dot(firstThird, thirdPoint);
  if (sixthDot >= 0 && fifthDot <= sixthDot) {
    return pointDistance(point, third);
  }

  const secondEdgeRegion = fifthDot * secondDot - firstDot * sixthDot;
  if (secondEdgeRegion <= 0 && secondDot >= 0 && sixthDot <= 0) {
    const weight = secondDot / (secondDot - sixthDot);
    return pointDistance(point, addScaled(first, firstThird, weight));
  }

  const thirdEdgeRegion = thirdDot * sixthDot - fifthDot * fourthDot;
  if (
    thirdEdgeRegion <= 0
    && fourthDot - thirdDot >= 0
    && fifthDot - sixthDot >= 0
  ) {
    const secondThird = subtract(third, second);
    const weight = (fourthDot - thirdDot) / (
      fourthDot - thirdDot + fifthDot - sixthDot
    );
    return pointDistance(point, addScaled(second, secondThird, weight));
  }

  const inverseTotal = 1 / (
    firstEdgeRegion + secondEdgeRegion + thirdEdgeRegion
  );
  const secondWeight = secondEdgeRegion * inverseTotal;
  const thirdWeight = firstEdgeRegion * inverseTotal;
  const closest = first.map((value, index) => (
    value
    + firstSecond[index] * secondWeight
    + firstThird[index] * thirdWeight
  ));
  return pointDistance(point, closest);
}

function triangleGeometry(
  mesh,
  indices,
  offset,
  matrix,
  transformRowPoint,
  positions,
) {
  if (!positions || !matrix) return null;
  const points = [0, 1, 2].map((corner) => {
    const index = indices[offset + corner];
    return transformRowPoint([
      positions[index * 3],
      positions[index * 3 + 1],
      positions[index * 3 + 2],
    ], matrix);
  });
  const firstEdge = points[1].map((value, axis) => value - points[0][axis]);
  const secondEdge = points[2].map((value, axis) => value - points[0][axis]);
  const normal = [
    firstEdge[1] * secondEdge[2] - firstEdge[2] * secondEdge[1],
    firstEdge[2] * secondEdge[0] - firstEdge[0] * secondEdge[2],
    firstEdge[0] * secondEdge[1] - firstEdge[1] * secondEdge[0],
  ];
  const normalLength = Math.hypot(...normal);
  if (normalLength <= 1e-12) return null;
  return Object.freeze({
    points: Object.freeze(points.map(point => Object.freeze(point))),
    normal: Object.freeze(normal.map(value => value / normalLength)),
    bounds: Object.freeze([0, 1, 2].map(axis => Object.freeze([
      Math.min(...points.map(point => point[axis])),
      Math.max(...points.map(point => point[axis])),
    ]))),
    textureId: mesh.metadata?.mt5TextureId || null,
  });
}

function renderedMeshes(root) {
  if (!root) return [];
  const candidates = [root, ...(root.getChildMeshes?.(false) || [])];
  return candidates.filter((mesh) => (
    mesh instanceof BABYLON.Mesh
    && mesh.getTotalVertices() > 0
    && mesh.getTotalIndices() > 0
  ));
}

function authoredSubtreeMeshes(modelRoot, subtreeRootNode) {
  if (!modelRoot || !subtreeRootNode) return [];
  const nodes = modelRoot._mt5Nodes || [];
  const nodesByAddress = new Map(nodes.map(node => [node.addr, node]));
  const belongsToSubtree = (node) => {
    let current = node;
    const visited = new Set();
    while (current && !visited.has(current.addr)) {
      if (current.addr === subtreeRootNode.addr) return true;
      visited.add(current.addr);
      current = nodesByAddress.get(current.parentAddr);
    }
    return false;
  };
  const meshes = new Set();
  for (const node of nodes) {
    if (!belongsToSubtree(node)) continue;
    for (const mesh of renderedMeshes(node.mesh)) meshes.add(mesh);
  }
  return [...meshes];
}

function pointIsCovered(point, normal, candidate, {
  maximumSeparation,
  minimumAbsoluteNormalDot,
}) {
  if (Math.abs(dot(normal, candidate.normal)) < minimumAbsoluteNormalDot) {
    return false;
  }
  if (candidate.bounds.some(([minimum, maximum], axis) => (
    point[axis] < minimum - maximumSeparation
    || point[axis] > maximum + maximumSeparation
  ))) return false;
  return pointTriangleDistance(point, candidate.points) <= maximumSeparation;
}

function trianglesShareSurface(first, second, {
  maximumSeparation,
  minimumAbsoluteNormalDot,
}) {
  if (Math.abs(dot(first.normal, second.normal)) < minimumAbsoluteNormalDot) {
    return false;
  }
  if (first.bounds.some(([firstMinimum, firstMaximum], axis) => {
    const [secondMinimum, secondMaximum] = second.bounds[axis];
    return firstMaximum < secondMinimum - maximumSeparation
      || secondMaximum < firstMinimum - maximumSeparation;
  })) return false;
  return first.points.some(point => (
    pointTriangleDistance(point, second.points) <= maximumSeparation
  )) || second.points.some(point => (
    pointTriangleDistance(point, first.points) <= maximumSeparation
  ));
}

/**
 * Return the detailed resource's triangle coverage in its attachment space.
 */
export function detailedSurfaceCoverage({
  detailedRoot,
  detailedLoader,
  detailedAttachmentNode,
  detailedPositions = mesh => mesh._mt5SourcePositions,
  includeMesh = () => true,
}) {
  const coverage = [];
  for (const mesh of renderedMeshes(detailedRoot).filter(includeMesh)) {
    const indices = mesh.getIndices();
    const matrix = attachmentSpaceMatrix(
      detailedLoader,
      detailedRoot,
      mesh,
      detailedAttachmentNode,
    );
    if (!indices || !matrix) continue;
    const positions = detailedPositions(mesh);
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      const geometry = triangleGeometry(
        mesh,
        indices,
        offset,
        matrix,
        detailedLoader.constructor.transformRowPoint,
        positions,
      );
      if (geometry) coverage.push(geometry);
    }
  }
  return Object.freeze(coverage);
}

/**
 * Transfer complete body triangles to a detailed native presentation surface.
 * Triangles crossing an attachment seam stay with the body; this preserves
 * neck and wrist transition geometry without actor-specific cuts or offsets.
 */
export function integrateDetailedSurface({
  bodyModelRoot,
  bodyAttachmentNode,
  bodyLoader,
  detailedRoot,
  detailedAttachmentNode,
  detailedLoader,
  detailedPositions,
  bodyPositions = mesh => mesh._mt5SourcePositions,
  surfacesMatch = () => true,
  priorityDetailedMeshFilter = null,
  maximumSeparation,
  minimumAbsoluteNormalDot = 0.8,
  replacementBoundaryRings = 0,
  allowCompleteReplacement = false,
  label = "native detailed surface",
}) {
  if (!(maximumSeparation > 0)) {
    throw new TypeError(`${label} maximum separation must be positive`);
  }
  if (
    !Number.isInteger(replacementBoundaryRings)
    || replacementBoundaryRings < 0
  ) {
    throw new TypeError(
      `${label} replacement boundary rings must be a non-negative integer`,
    );
  }
  const coverage = detailedSurfaceCoverage({
    detailedRoot,
    detailedLoader,
    detailedAttachmentNode,
    detailedPositions,
  });
  const priorityCoverage = typeof priorityDetailedMeshFilter === "function"
    ? detailedSurfaceCoverage({
        detailedRoot,
        detailedLoader,
        detailedAttachmentNode,
        detailedPositions,
        includeMesh: priorityDetailedMeshFilter,
      })
    : [];
  const patches = [];
  let removedTriangleCount = 0;
  let retainedTriangleCount = 0;
  const coverageOptions = { maximumSeparation, minimumAbsoluteNormalDot };

  for (const mesh of authoredSubtreeMeshes(bodyModelRoot, bodyAttachmentNode)) {
    const indices = mesh.getIndices();
    const matrix = attachmentSpaceMatrix(
      bodyLoader,
      bodyModelRoot,
      mesh,
      bodyAttachmentNode,
    );
    if (!indices || !matrix) continue;
    const positions = bodyPositions(mesh);
    const candidates = coverage.filter(candidate => surfacesMatch(
      mesh.metadata?.mt5TextureId || null,
      candidate.textureId,
    ));
    const priorityCandidates = priorityCoverage.filter(candidate => surfacesMatch(
      mesh.metadata?.mt5TextureId || null,
      candidate.textureId,
    ));
    const triangles = [];
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
      const geometry = triangleGeometry(
        mesh,
        indices,
        offset,
        matrix,
        bodyLoader.constructor.transformRowPoint,
        positions,
      );
      const coveredByDetailedSurface = Boolean(geometry && (
        geometry.points.every(point => (
          candidates.some(candidate => pointIsCovered(
            point,
            geometry.normal,
            candidate,
            coverageOptions,
          ))
        ))
      ));
      const coveredByPrioritySurface = Boolean(
        geometry && priorityCandidates.some(candidate => trianglesShareSurface(
          geometry,
          candidate,
          coverageOptions,
        )),
      );
      triangles.push({
        indices: triangle,
        replaced: coveredByDetailedSurface || coveredByPrioritySurface,
        priority: coveredByPrioritySurface,
      });
    }

    // A separate detailed surface with no authored seam references cannot
    // prove that it closes the body's attachment boundary. Erode its ordinary
    // replacement mask by a small number of topology rings so the body keeps
    // a continuous transition band. Priority inserts (for example detailed
    // eyes) still replace their exact low-detail surfaces completely.
    let boundaryVertices = new Set(
      triangles
        .filter(triangle => !triangle.replaced)
        .flatMap(triangle => triangle.indices),
    );
    for (let ring = 0; ring < replacementBoundaryRings; ring += 1) {
      if (boundaryVertices.size === 0) break;
      const nextBoundaryVertices = new Set();
      for (const triangle of triangles) {
        if (
          !triangle.replaced
          || triangle.priority
          || !triangle.indices.some(index => boundaryVertices.has(index))
        ) continue;
        triangle.replaced = false;
        for (const index of triangle.indices) nextBoundaryVertices.add(index);
      }
      boundaryVertices = nextBoundaryVertices;
    }

    const retained = triangles
      .filter(triangle => !triangle.replaced)
      .flatMap(triangle => triangle.indices);
    const removedFromMesh = triangles.length - retained.length / 3;
    retainedTriangleCount += retained.length / 3;
    if (removedFromMesh > 0) {
      patches.push(Object.freeze({ mesh, indices: Array.from(indices) }));
      mesh.setIndices(retained);
      removedTriangleCount += removedFromMesh;
    }
  }

  if (removedTriangleCount === 0) {
    throw new Error(`${label} does not overlap its body attachment`);
  }
  if (retainedTriangleCount === 0 && !allowCompleteReplacement) {
    restoreDetailedSurface(patches);
    throw new Error(`${label} would remove the entire body attachment`);
  }
  return Object.freeze({
    patches: Object.freeze(patches),
    removedTriangleCount,
    retainedTriangleCount,
  });
}

/**
 * Transfer an articulated attachment (such as a hand) at the detailed
 * resource's authored proximal boundary. The longest attachment-space axis is
 * its limb axis; the endpoint nearest the attachment origin is the seam.
 */
export function integrateDetailedAttachmentBoundary({
  bodyModelRoot,
  bodyAttachmentNode,
  bodyLoader,
  detailedRoot,
  detailedAttachmentNode,
  detailedLoader,
  detailedPositions,
  bodyPositions = mesh => mesh._mt5SourcePositions,
  label = "native detailed attachment",
}) {
  const coverage = detailedSurfaceCoverage({
    detailedRoot,
    detailedLoader,
    detailedAttachmentNode,
    detailedPositions,
  });
  if (coverage.length === 0) {
    throw new Error(`${label} has no authored surface`);
  }
  const points = coverage.flatMap(triangle => triangle.points);
  const bounds = [0, 1, 2].map(axis => [
    Math.min(...points.map(point => point[axis])),
    Math.max(...points.map(point => point[axis])),
  ]);
  const limbAxis = bounds.reduce((selected, range, axis) => (
    range[1] - range[0] > bounds[selected][1] - bounds[selected][0]
      ? axis
      : selected
  ), 0);
  const [minimum, maximum] = bounds[limbAxis];
  const growsPositive = Math.abs(minimum) <= Math.abs(maximum);
  const boundary = growsPositive ? minimum : maximum;
  const ownsPoint = growsPositive
    ? point => point[limbAxis] >= boundary
    : point => point[limbAxis] <= boundary;

  const patches = [];
  let removedTriangleCount = 0;
  let retainedTriangleCount = 0;
  for (const mesh of authoredSubtreeMeshes(bodyModelRoot, bodyAttachmentNode)) {
    const indices = mesh.getIndices();
    const matrix = attachmentSpaceMatrix(
      bodyLoader,
      bodyModelRoot,
      mesh,
      bodyAttachmentNode,
    );
    if (!indices || !matrix) continue;
    const positions = bodyPositions(mesh);
    const retained = [];
    let removedFromMesh = 0;
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
      const geometry = triangleGeometry(
        mesh,
        indices,
        offset,
        matrix,
        bodyLoader.constructor.transformRowPoint,
        positions,
      );
      if (geometry && geometry.points.every(ownsPoint)) {
        removedFromMesh += 1;
      } else {
        retained.push(...triangle);
      }
    }
    retainedTriangleCount += retained.length / 3;
    if (removedFromMesh > 0) {
      patches.push(Object.freeze({ mesh, indices: Array.from(indices) }));
      mesh.setIndices(retained);
      removedTriangleCount += removedFromMesh;
    }
  }
  if (removedTriangleCount === 0) {
    throw new Error(`${label} does not replace its body attachment`);
  }
  if (retainedTriangleCount === 0) {
    restoreDetailedSurface(patches);
    throw new Error(`${label} would remove its body-side seam`);
  }
  return Object.freeze({
    patches: Object.freeze(patches),
    removedTriangleCount,
    retainedTriangleCount,
    limbAxis,
    boundary,
    growsPositive,
  });
}

export function restoreDetailedSurface(integration) {
  const patches = Array.isArray(integration)
    ? integration
    : integration?.patches || [];
  for (const patch of patches) patch.mesh.setIndices(patch.indices);
  return true;
}
