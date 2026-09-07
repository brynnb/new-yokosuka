const POSITION_EPSILON = 1e-6;

function finiteVector3(vector) {
  return Boolean(vector) && [vector.x, vector.y, vector.z].every(Number.isFinite);
}

function approximatelyEqual(left, right, epsilon = POSITION_EPSILON) {
  return Math.abs(left - right) <= epsilon;
}

function renderableMeshes(root) {
  return root.getDescendants(false).filter((node) => (
    typeof node.getTotalVertices === "function"
    && node.getTotalVertices() > 0
  ));
}

function meshCanRender(mesh) {
  const materialAlpha = mesh.material?.alpha;
  return (
    mesh.isEnabled()
    && mesh.isVisible !== false
    && mesh.visibility > 0
    && (materialAlpha === undefined || materialAlpha > 0)
  );
}

export function inspectRuntimePlacementRoot(root, placement, rootIndex = 0) {
  root.computeWorldMatrix(true);
  for (const node of root.getDescendants(false)) {
    node.computeWorldMatrix?.(true);
  }

  const meshes = renderableMeshes(root);
  const bounds = root.getHierarchyBoundingVectors(true);
  const boundsFinite = finiteVector3(bounds.min) && finiteVector3(bounds.max);
  const expectedPosition = placement.position;
  const positionMatches = (
    Array.isArray(expectedPosition)
    && expectedPosition.length === 3
    && expectedPosition.every(Number.isFinite)
    && approximatelyEqual(root.position.x, expectedPosition[0])
    && approximatelyEqual(root.position.y, expectedPosition[1])
    && approximatelyEqual(root.position.z, expectedPosition[2])
  );
  const visibleMeshCount = meshes.filter(meshCanRender).length;
  const failures = [];
  if (meshes.length === 0) failures.push("no-renderable-geometry");
  if (visibleMeshCount === 0) failures.push("no-visible-renderable-geometry");
  if (!boundsFinite) failures.push("non-finite-world-bounds");
  if (!positionMatches) failures.push("root-transform-mismatch");

  return {
    placementId: placement.id ?? null,
    model: placement.model,
    objectTag: placement.runtime?.objectTag ?? null,
    rootIndex,
    renderKeys: [...new Set((root._mt5Nodes || []).map((node) => {
      const key = node.flag & 0xffff;
      return key >= 0x8000 ? key - 0x10000 : key;
    }))].sort((left, right) => left - right),
    vertexCount: meshes.reduce(
      (total, mesh) => total + mesh.getTotalVertices(),
      0,
    ),
    renderableMeshCount: meshes.length,
    visibleMeshCount,
    expectedPosition: expectedPosition ?? null,
    actualPosition: root.position.asArray(),
    worldBounds: boundsFinite
      ? { min: bounds.min.asArray(), max: bounds.max.asArray() }
      : null,
    failures,
    status: failures.length === 0 ? "verified" : "failed",
  };
}

export function auditRuntimePlacementRoots(placement, roots) {
  if (!Array.isArray(roots) || roots.length === 0) {
    return [{
      placementId: placement.id ?? null,
      model: placement.model,
      objectTag: placement.runtime?.objectTag ?? null,
      rootIndex: null,
      renderKeys: [],
      vertexCount: 0,
      renderableMeshCount: 0,
      visibleMeshCount: 0,
      expectedPosition: placement.position ?? null,
      actualPosition: null,
      worldBounds: null,
      failures: ["loader-returned-no-root"],
      status: "failed",
    }];
  }
  return roots.map(
    (root, index) => inspectRuntimePlacementRoot(root, placement, index),
  );
}

export function summarizeRuntimePlacementAudit(placements, records) {
  const failedRecords = records.filter((record) => record.status !== "verified");
  const instantiatedPlacementKeys = new Set(
    records
      .filter((record) => record.rootIndex !== null)
      .map((record) => `${record.model}\0${record.expectedPosition?.join(",")}\0${record.objectTag ?? ""}`),
  );
  const expectedPlacementKeys = new Set(
    placements.map((placement) => (
      `${placement.model}\0${placement.position?.join(",")}\0${placement.runtime?.objectTag ?? ""}`
    )),
  );
  const missingPlacementKeys = [...expectedPlacementKeys].filter(
    (key) => !instantiatedPlacementKeys.has(key),
  );

  return {
    expectedPlacementCount: placements.length,
    distinctExpectedPlacementCount: expectedPlacementKeys.size,
    instantiatedPlacementCount: expectedPlacementKeys.size - missingPlacementKeys.length,
    rootCount: records.filter((record) => record.rootIndex !== null).length,
    renderableVertexCount: records.reduce(
      (total, record) => total + record.vertexCount,
      0,
    ),
    failedRecordCount: failedRecords.length,
    missingPlacementCount: missingPlacementKeys.length,
    status: (
      failedRecords.length === 0
      && missingPlacementKeys.length === 0
    ) ? "verified" : "failed",
    failures: failedRecords,
    missingPlacementKeys,
  };
}
